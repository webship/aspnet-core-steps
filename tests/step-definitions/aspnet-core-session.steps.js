'use strict';

// The session: logging in by a handle of the users registry or with an email and a password, the login form and
// its refusals, "Remember me?", the page asked for before the login, logging out, who is signed in, a browser
// closed and opened again, a session the app no longer accepts, and the cookies of the session.
//
// The login page is the account page `Login` (`worldParameters.accountPath`: /Identity/Account/Login for the default
// pages of a Razor Pages or MVC app, /Account/Login in a Blazor Web App): a form with the fields "Email" and
// "Password", the checkbox "Remember me?" ("Remember me" in a Blazor app) and the button "Log in". A refused login
// comes back to it with "Invalid login attempt."; a locked-out account goes to the Lockout page; an account with
// two-factor sign-in goes to the page that asks for its code (LoginWith2fa).
//
// Accounts are configuration, not test data: they are listed in cucumber.js (`worldParameters.users`) and made once
// by the build of the app. A feature never creates or deletes users.

const crypto = require('crypto');
const { Before, Given, When, Then } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  siteUrl,
  accountPage,
  protectedPath,
  sessionCookieName,
  antiforgeryCookiePrefix,
  isOnPath,
  isOnAccountPage,
  open,
  navigating,
  settle,
  assertPresence,
  resolveUser,
  SESSIONS,
  sessionKey,
  reuseSessions,
  forgetSession,
  cookieNamed,
  loginForm,
  onLoginPage,
  pressAndWait,
  pageMessages,
  formErrors,
  describePage,
  totp,
} = require('./aspnet-core-helpers');

const LOGIN_HINT = 'The login page is the account page Login under worldParameters.accountPath (/Identity/Account for the default account pages, /Account in a Blazor Web App): an "Email" field, a "Password" field and a "Log in" button. Check launchUrl and accountPath in cucumber.js.';

// The page a visitor asked for when the app sent the browser to the login page instead: the app keeps it in the
// ReturnUrl of the login page and opens it after the login.
const TRACKED_PAGES = new WeakSet();
function trackAskedFor(world) {
  const page = world.page;
  if (!page || TRACKED_PAGES.has(page)) return;
  TRACKED_PAGES.add(page);
  page.on('response', (response) => {
    try {
      const request = response.request();
      const status = response.status();
      if (!request.isNavigationRequest() || response.frame() !== page.mainFrame() || status < 300 || status >= 400) return;
      if (request.method() !== 'GET') return;
      const from = new URL(response.url());
      const to = new URL(response.headers().location || '', response.url());
      const login = accountPage(world, 'Login').toLowerCase();
      if (to.pathname.replace(/\/+$/, '').toLowerCase() === login && from.pathname.replace(/\/+$/, '').toLowerCase() !== login) {
        world.__askedFor = from.pathname + from.search;
      }
    } catch { /* a response without a usable address */ }
  });
}
Before(function () {
  this.__askedFor = null;
  this.__sessionKey = null;
  this.__loginAttempt = null;
  trackAskedFor(this);
});
onNewPage((world) => trackAskedFor(world));

/** The field of the login form a person types the email (or the user name) in, by its label first. */
async function emailField(world) {
  const form = loginForm(world);
  for (const label of ['Email', 'Email address', 'Username', 'User name', 'Login']) {
    const byLabel = form.getByLabel(label, { exact: true });
    if (await byLabel.count()) return byLabel.first();
  }
  for (const selector of ['input[name="Input.Email"]', 'input[type="email"]', 'input[name$="Email"]', 'input[name$="UserName"]', 'input[type="text"]']) {
    const field = form.locator(selector);
    if (await field.count()) return field.first();
  }
  throw friendly({ message: `The login form has no email field (${world.page.url()}).`, hint: LOGIN_HINT });
}

/** The password field of the login form. */
async function passwordField(world) {
  const form = loginForm(world);
  const byLabel = form.getByLabel('Password', { exact: true });
  if (await byLabel.count()) return byLabel.first();
  return form.locator('input[type="password"]').first();
}

/** Open the login page (the cookies of the browser stay), and wait for its form. */
async function openLoginForm(world) {
  await open(world, siteUrl(world, accountPage(world, 'Login')));
  try {
    await loginForm(world).waitFor({ state: 'visible', timeout: budget(world) });
  } catch (err) {
    throw friendly({ message: `The login form did not appear at ${siteUrl(world, accountPage(world, 'Login'))} (${await describePage(world)}).`, cause: err, hint: LOGIN_HINT });
  }
}

/** Tick or untick a checkbox of a form by its label ("Remember me?", "Remember this machine"). */
async function setCheckbox(world, form, label, checked) {
  let box = form.getByLabel(label, { exact: true });
  if (!(await box.count())) box = form.getByLabel(new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\?$/, '\\??'), 'i'));
  if (!(await box.count())) {
    const boxes = await form.locator('input[type="checkbox"]').evaluateAll((els) => els.map((el) => ((el.labels && el.labels[0] && el.labels[0].textContent) || el.name || '').trim()));
    throw friendly({ message: `The form has no "${label}" checkbox. It has: ${listed(boxes)}.`, hint: 'Name the checkbox by its label as the page writes it ("Remember me?" on the login page).' });
  }
  if ((await box.first().isChecked()) !== checked) await box.first().click();
}

/** The reasons the page gives for a refusal: the summary of its form and its error messages. */
async function refusalMessages(world) {
  const messages = [...(await formErrors(world)), ...(await pageMessages(world)).filter((m) => m.kind === 'error' || m.kind === '').map((m) => m.text)];
  return [...new Set(messages.map(clean))].filter(Boolean);
}

/** Whether the browser shows the page that asks for the code of an authenticator app. */
async function onCodePage(world) {
  if (!isOnAccountPage(world, 'LoginWith2fa')) return false;
  return (await world.page.locator('form input[name$="TwoFactorCode"], form input[autocomplete="one-time-code"]').count().catch(() => 0)) > 0;
}

/**
 * Fill in and submit the login form, and wait for the page that answers: the login page again (with the reason it
 * gives), the page of the code of an authenticator app, the Lockout page, or another page (the login worked). The
 * login page on screen is used as it is, so a page asked for before it (its ReturnUrl) opens after the login;
 * otherwise the step opens the login page.
 *
 * @returns {Promise<{outcome: 'in'|'refused'|'code'|'lockout'|'error', error: string}>}
 */
async function submitLogin(world, login, password, { checkbox = null } = {}) {
  if (!(await onLoginPage(world))) await openLoginForm(world);
  await (await emailField(world)).fill(login);
  await (await passwordField(world)).fill(password);
  if (checkbox) await setCheckbox(world, loginForm(world), checkbox.label, checkbox.checked);
  // The button "Log in" by its words: a form can have another one ("Log in with a passkey" in a Blazor Web App).
  const named = loginForm(world).getByRole('button', { name: /^\s*log ?in\s*$/i }).filter({ visible: true });
  const submit = (await named.count()) ? named.first() : loginForm(world).locator('button[type="submit"], input[type="submit"], button:not([type])').filter({ visible: true }).first();
  await pressAndWait(world, submit, { label: `Logging in as "${login}"`, hint: LOGIN_HINT });
  if (await onCodePage(world)) return { outcome: 'code', error: 'the app asks for the code of an authenticator app' };
  if (isOnAccountPage(world, 'Lockout')) return { outcome: 'lockout', error: 'the app shows the Lockout page: the account is locked out' };
  if (await onLoginPage(world)) {
    const messages = await refusalMessages(world);
    return { outcome: 'refused', error: messages.join(' ') || 'the login page came back without a message' };
  }
  // Still on the login path without its form: the app answered the form itself with an error page (a refused
  // anti-forgery token, 400).
  if (isOnAccountPage(world, 'Login')) return { outcome: 'error', error: `the login form was answered with ${await describePage(world)}` };
  return { outcome: 'in', error: '' };
}

/** Type the code of an authenticator app on the page that asks for it, worked out from a key, and send it. */
async function enterCode(world, code, { remember = null } = {}) {
  const form = world.page.locator('form:has(input[name$="TwoFactorCode"])').first();
  await form.locator('input[name$="TwoFactorCode"]').fill(code);
  if (remember !== null) await setCheckbox(world, form, 'Remember this machine', remember);
  const submit = form.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
  await pressAndWait(world, submit, { label: 'Sending the code of the authenticator app' });
}

/** Keep the session of an account that has just logged in, for the scenarios after this one. */
async function keepSession(world, user) {
  if (!reuseSessions(world)) return;
  const key = sessionKey(world, user.login);
  SESSIONS.set(key, await world.page.context().cookies());
  world.__sessionKey = key;
}

/** Take over the session an account opened earlier in this run. */
async function restoreSession(world, user) {
  const key = sessionKey(world, user.login);
  const cookies = SESSIONS.get(key);
  if (!cookies || !reuseSessions(world)) return false;
  const context = world.page.context();
  await context.clearCookies();
  await context.addCookies(cookies);
  await open(world, siteUrl(world, protectedPath(world)));
  if (!(await onLoginPage(world))) {
    world.__sessionKey = key;
    return true;
  }
  // The session ended since (a logout, a change of the account): log in again.
  SESSIONS.delete(key);
  await context.clearCookies();
  return false;
}

/** The names the page shows in its header or navigation for the signed-in account: the link to its Manage pages. */
async function shownAccountNames(world) {
  const manage = accountPage(world, 'Manage').toLowerCase();
  return world.page.evaluate((managePath) => {
    const out = [];
    for (const a of document.querySelectorAll('header a[href], nav a[href], [role="banner"] a[href], [role="navigation"] a[href]')) {
      let target = '';
      try { target = new URL(a.getAttribute('href'), document.baseURI).pathname.replace(/\/+$/, '').toLowerCase(); } catch { continue; }
      if (target !== managePath) continue;
      const text = a.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
    return out;
  }, manage).catch(() => []);
}

/**
 * Log in as an account of the users registry (`worldParameters.users` in cucumber.js), by its handle, as a new
 * visitor. An account that logged in earlier in the run takes its session over; otherwise the step logs in through
 * the login form, and types the code of the account's authenticator app (worked out from `otpSecret`) when the app
 * asks for one.
 *
 * Example #1: Given I am a logged in user with the "administrator" user
 * Example #2: Given we are a logged in user with the "user" user
 * Example #3: Given I am a logged in user with "twofactoruser"
 * Example #4: And I am a logged in user with the "user" user
 * Example #5: Given we are a logged in user with the "administrator" user
 */
Given(/^(I am |we are )*a logged in user with( the)* "([^"]*)"( user)*$/, { timeout: 120000 }, async function (pronounCase, theCase, handle, userCase) {
  const user = resolveUser(this, handle);
  if (await restoreSession(this, user)) return;
  // A new visitor: no cookie, and a login page of its own.
  await this.page.context().clearCookies();
  await openLoginForm(this);
  let result = await submitLogin(this, user.login, user.password);
  if (result.outcome === 'code') {
    if (!user.otpSecret) {
      throw friendly({ message: `The app asks "${handle}" for the code of an authenticator app, and the users registry has no otpSecret for it.`, hint: `Set worldParameters.users.${handle}.otpSecret in cucumber.js to the account's key (base32), or use "When I submit the login form as "${handle}"" and type a code.` });
    }
    await enterCode(this, totp(user.otpSecret));
    result = (await onCodePage(this)) ? { outcome: 'refused', error: (await refusalMessages(this)).join(' ') || 'the code was refused' } : { outcome: 'in', error: '' };
  }
  if (result.outcome !== 'in') {
    throw friendly({
      message: `Could not log in as "${handle}" (${user.login}): ${result.error}.`,
      hint: 'Check the email and the password of the account in worldParameters.users, and that the build of the app made the account (its email confirmed, not locked out).',
    });
  }
  await keepSession(this, user);
});

/**
 * Start as a visitor: the browser holds no cookie of the site, so no session.
 *
 * Example #1: Given I am not logged in
 * Example #2: Given we are not logged in
 * Example #3: And I am not logged in
 * Example #4: Given I am not logged in
 * Example #5: And we are not logged in
 */
Given(/^(I am |we are )*not logged in$/, async function (pronounCase) {
  await this.page.context().clearCookies();
  this.__sessionKey = null;
  await open(this, siteUrl(this, '/'));
});

/**
 * Open the login page (the account page Login) and wait for its form. The cookies of the browser stay.
 *
 * Example #1: Given I am on the login page
 * Example #2: Given we are on the login page
 * Example #3: And I am on the login page
 * Example #4: Given I am on the login page
 * Example #5: And we are on the login page
 */
Given(/^(I am |we are )*on the login page$/, async function (pronounCase) {
  await openLoginForm(this);
});

/**
 * Go to the login page (the account page Login) and wait for its form.
 *
 * Example #1: When I go to the login page
 * Example #2: When we go to the login page
 * Example #3: And I go to the login page
 * Example #4: When I go to the login page
 * Example #5: Then I go to the login page
 */
When(/^(I |we )*go to the login page$/, async function (pronounCase) {
  await openLoginForm(this);
});

/**
 * Log in through the login form as an account of the users registry, as a person with the account's authenticator
 * app does: the login page on screen (so the page asked for before it opens after the login), or the login page
 * opened for it; the code of the authenticator app typed when the app asks for one (worked out from `otpSecret`).
 * A checkbox of the form can be ticked or unticked on the way ("Remember me?"). The step fails when the app refuses
 * the login; to stop at the page that asks for the code, use "I submit the login form as ...".
 *
 * Example #1: When I log in as "administrator" with the login form
 * Example #2: When we log in as "user" with the login form
 * Example #3: When I log in as "user" with the login form and "Remember me?" checked
 * Example #4: And I log in as "twofactoruser" with the login form and "Remember me?" unchecked
 * Example #5: When we log in as "twofactoruser" with the login form
 */
When(/^(I |we )*log in as "([^"]*)" with the login form(?: and "([^"]*)" (checked|unchecked))?$/, { timeout: 120000 }, async function (pronounCase, handle, checkbox, state) {
  const user = resolveUser(this, handle);
  this.__loginAttempt = handle;
  let result = await submitLogin(this, user.login, user.password, { checkbox: checkbox ? { label: checkbox, checked: state === 'checked' } : null });
  if (result.outcome === 'code' && user.otpSecret) {
    await enterCode(this, totp(user.otpSecret));
    result = (await onCodePage(this)) ? { outcome: 'refused', error: (await refusalMessages(this)).join(' ') || 'the code was refused' } : { outcome: 'in', error: '' };
  }
  if (result.outcome !== 'in') {
    throw friendly({
      message: `The login form refused "${handle}" (${user.login}): ${result.error}.`,
      hint: result.outcome === 'code' ? `Set worldParameters.users.${handle}.otpSecret to the account's key, or use "I submit the login form as "${handle}"" to stop at the page of the code.` : 'Check the email and the password of the account in worldParameters.users, and that the build of the app made the account.',
    });
  }
  // The login gave the account a new session: the one kept for it in this run is replaced.
  SESSIONS.delete(sessionKey(this, user.login));
  await keepSession(this, user);
});

/**
 * Submit the login form as an account of the users registry (its email and its password) and stop on the page the
 * app answers with: the page that asks for the code of an authenticator app, the Lockout page, the login page with
 * its refusal, or the app. Assert the outcome with the next step.
 *
 * Example #1: When I submit the login form as "twofactoruser"
 * Example #2: When we submit the login form as "lockeduser"
 * Example #3: When I submit the login form as "unconfirmeduser"
 * Example #4: And I submit the login form as "user"
 * Example #5: When I submit the login form as "twofactoruser" with "Remember me?" checked
 */
When(/^(I |we )*submit the login form as "([^"]*)"(?: with "([^"]*)" (checked|unchecked))?$/, async function (pronounCase, handle, checkbox, state) {
  const user = resolveUser(this, handle);
  this.__loginAttempt = handle;
  await submitLogin(this, user.login, user.password, { checkbox: checkbox ? { label: checkbox, checked: state === 'checked' } : null });
});

/**
 * Submit the login form with an email (or a user name) and a password. The step does not expect the login to
 * succeed: assert the outcome with the next step (the refusal of the login page, the page it goes to).
 *
 * Example #1: When I log in with the email "user@example.com" and the password "Wrong-password-1"
 * Example #2: When we log in with the email "nobody@example.com" and the password "Whatever-123"
 * Example #3: And I log in with the username "administrator@example.com" and the password "not-the-password"
 * Example #4: When I log in with the email address "user@example.com" and the password ""
 * Example #5: When we log in with the email "unconfirmeduser@example.com" and the password "Wrong-password-1"
 */
When(/^(I |we )*log in with the (?:email address|email|username|user name) "([^"]*)" and the password "([^"]*)"$/, async function (pronounCase, login, password) {
  await submitLogin(this, login, password);
});

/**
 * Assert that the login was refused: the browser is back on the login page (or on the page of the code of an
 * authenticator app), which says why. The default account pages say "Invalid login attempt." for a wrong password,
 * an unknown account and an account whose email is not confirmed alike, and "Invalid authenticator code." for a wrong
 * code.
 *
 * Example #1: Then the login should be refused with "Invalid login attempt."
 * Example #2: Then the login should be refused with "Invalid authenticator code."
 * Example #3: And the login should be refused with "Invalid login attempt."
 * Example #4: Then the login should be refused with "Invalid login attempt"
 * Example #5: But the login should be refused with "Invalid login attempt."
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (message) {
  await settle(this);
  if (!(await onLoginPage(this)) && !(await onCodePage(this))) {
    throw friendly({ message: `Expected the login to be refused, but the browser left the login page: ${await describePage(this)}.`, hint: 'A refused login comes back to the login page with its reason; this one was let in, or went to another page (the Lockout page: "I should see the lockout page").' });
  }
  const messages = await refusalMessages(this);
  const wanted = clean(message).replace(/[.!]$/, '').toLowerCase();
  if (!messages.some((m) => clean(m).replace(/^error:\s*/i, '').replace(/[.!]$/, '').toLowerCase() === wanted)) {
    throw friendly({ message: `The login page does not say "${message}". It says: ${listed(messages)}.`, hint: 'Name the message as the login page writes it ("Invalid login attempt." on the default account pages).' });
  }
});

/**
 * Assert that the browser shows the login page with its form: a page that needs a session sent a visitor there, a
 * refused login came back.
 *
 * Example #1: Then I should be on the login page
 * Example #2: Then we should be on the login page
 * Example #3: And I should be on the login page
 * Example #4: Then I should be on the login page
 * Example #5: But we should be on the login page
 */
Then(/^(I |we )*should be on the login page$/, async function (pronounCase) {
  await settle(this);
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `Expected the login page (${accountPage(this, 'Login')}), but the browser shows ${await describePage(this)}.`, hint: 'A page that needs a session sends a visitor to the login page: check worldParameters.accountPath, and that the session really ended.' });
  }
});

/**
 * Assert that the page shows, or does not show, a login form (a password field and a submit button).
 *
 * Example #1: Then I should see the login form
 * Example #2: Then we should see the login form
 * Example #3: And I should see the login form
 * Example #4: Then I should not see the login form
 * Example #5: But we should not see the login form
 */
Then(/^(I |we )*should( not)* see the login form$/, async function (pronounCase, notCase) {
  await settle(this);
  await assertPresence(this.page.locator('form:has(input[type="password"]):has(button[type="submit"], input[type="submit"], button:not([type]))'), notCase, {
    label: 'the login form',
    hint: LOGIN_HINT,
    timeout: budget(this),
    found: async () => `The browser shows ${await describePage(this)}.`,
  });
});

/** The logout button of the page: a form that posts to the Logout account page. */
async function logoutButton(world) {
  const logout = accountPage(world, 'Logout').toLowerCase();
  const forms = world.page.locator('form');
  const count = await forms.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const form = forms.nth(i);
    const action = await form.evaluate((f) => {
      try { return new URL(f.getAttribute('action') || '', document.baseURI).pathname.replace(/\/+$/, '').toLowerCase(); } catch { return ''; }
    }).catch(() => '');
    if (action !== logout) continue;
    const button = form.locator('button, input[type="submit"]').filter({ visible: true }).first();
    if (await button.count()) return button;
  }
  return null;
}

/**
 * Log out as a person does: the logout button of the page (a form that posts to the Logout account page, in the
 * navigation of the app), else the one of the home page, else the button of the Logout page. The session cookie goes.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: Then I log out
 * Example #5: When I log out
 */
When(/^(I |we )*log out$/, async function (pronounCase) {
  forgetSession(this);
  let button = await logoutButton(this);
  if (!button) {
    await open(this, siteUrl(this, '/'));
    button = await logoutButton(this);
  }
  if (!button) {
    await open(this, siteUrl(this, accountPage(this, 'Logout')));
    button = await logoutButton(this);
  }
  if (!button) {
    throw friendly({ message: `There is nothing to log out with: no form of the page posts to ${accountPage(this, 'Logout')} (${await describePage(this)}).`, hint: 'Is anybody logged in? The logout button is in the navigation of the app for a signed-in account.' });
  }
  await pressAndWait(this, button, { label: 'Logging out', hint: 'A logout posts to the Logout account page and lands on the page the app chose.' });
});

/**
 * Go to the Logout account page. For a signed-in account the default account pages answer a GET with a page whose
 * button ("Click here to Logout") logs out; nothing ends until it is pressed.
 *
 * Example #1: When I go to the logout page
 * Example #2: When we go to the logout page
 * Example #3: And I go to the logout page
 * Example #4: When I go to the logout page
 * Example #5: Then I go to the logout page
 */
When(/^(I |we )*go to the logout page$/, async function (pronounCase) {
  await open(this, siteUrl(this, accountPage(this, 'Logout')));
});

/**
 * Assert that the browser shows the Logout page with a button that logs out, the page asking to confirm the logout.
 *
 * Example #1: Then I should be asked to confirm the logout
 * Example #2: Then we should be asked to confirm the logout
 * Example #3: And I should be asked to confirm the logout
 * Example #4: Then I should be asked to confirm the logout
 * Example #5: And we should be asked to confirm the logout
 */
Then(/^(I |we )*should be asked to confirm the logout$/, async function (pronounCase) {
  await settle(this);
  if (!isOnAccountPage(this, 'Logout') || !(await logoutButton(this))) {
    throw friendly({ message: `Expected the Logout page with its button, but the browser shows ${await describePage(this)}.`, hint: `Open it with "I go to the logout page" (${accountPage(this, 'Logout')}) as a signed-in account: a visitor is told the logout is done.` });
  }
});

/**
 * Press the button of the Logout page, and wait for the page the logout leads to.
 *
 * Example #1: When I confirm the logout
 * Example #2: When we confirm the logout
 * Example #3: And I confirm the logout
 * Example #4: When I confirm the logout
 * Example #5: Then I confirm the logout
 */
When(/^(I |we )*confirm the logout$/, async function (pronounCase) {
  const button = isOnAccountPage(this, 'Logout') ? await logoutButton(this) : null;
  if (!button) {
    throw friendly({ message: `There is no logout to confirm on this page (${await describePage(this)}).`, hint: 'Go to the logout page first (I go to the logout page).' });
  }
  forgetSession(this);
  await pressAndWait(this, button, { label: 'Confirming the logout' });
});

/**
 * Assert that somebody is, or nobody is, logged in. The step opens a page only a signed-in account may open
 * (`worldParameters.protectedPath`): a visitor is sent to the login page instead.
 *
 * Example #1: Then I should be logged in
 * Example #2: Then we should be logged in
 * Example #3: Then I should not be logged in
 * Example #4: And we should not be logged in
 * Example #5: But I should not be logged in
 */
Then(/^(I |we )*should( not)* be logged in$/, async function (pronounCase, notCase) {
  await open(this, siteUrl(this, protectedPath(this)));
  const signed = !(await onLoginPage(this));
  if (notCase && signed) {
    throw friendly({ message: `Expected nobody to be logged in, but ${protectedPath(this)} opened without the login page (${await describePage(this)}).`, hint: 'Log out first (I log out), or start as a visitor (I am not logged in). A sign-in cookie kept with "Remember me?" signs the browser in again.' });
  }
  if (!notCase && !signed) {
    throw friendly({ message: `Expected to be logged in, but ${protectedPath(this)} sent the browser to the login page.`, hint: 'Log in first (I am a logged in user with the "..." user). Check worldParameters.protectedPath: a page only a signed-in account may open.' });
  }
});

/**
 * Assert who is logged in, by a handle of the users registry: the step opens a page only a signed-in account may
 * open (`worldParameters.protectedPath`), whose navigation names the account in its link to the Manage pages
 * ("Hello user@example.com!" on the default pages; the email in a Blazor Web App).
 *
 * Example #1: Then I should be logged in as "administrator"
 * Example #2: Then we should be logged in as "user"
 * Example #3: And I should be logged in as "twofactoruser"
 * Example #4: Then I should be logged in as "user"
 * Example #5: And we should be logged in as "administrator"
 */
Then(/^(I |we )*should be logged in as "([^"]*)"$/, async function (pronounCase, handle) {
  const user = resolveUser(this, handle);
  const wanted = [user.name, user.login, user.email].filter(Boolean).map((n) => n.toLowerCase());
  // Always a page asked for now: a page drawn before a logout or an expiry still shows the name it had.
  await open(this, siteUrl(this, protectedPath(this)));
  if (await onLoginPage(this)) {
    throw friendly({ message: `Expected "${handle}" (${user.login}) to be logged in, but nobody is: ${protectedPath(this)} sent the browser to the login page.`, hint: 'Log in first (I am a logged in user with the "..." user).' });
  }
  const names = await shownAccountNames(this);
  if (!names.some((n) => wanted.some((w) => n.toLowerCase().split(/[\s!,]+/).includes(w) || n.toLowerCase() === w))) {
    throw friendly({
      message: `Expected "${handle}" (${user.name || user.login}) to be logged in, but the navigation names ${listed(names)}.`,
      hint: 'The step reads the link of the navigation to the Manage pages of the account ("Hello user@example.com!"). Set worldParameters.users.<handle>.name to the name the app shows.',
    });
  }
});

/**
 * Close the browser and open it again: the browser keeps only what outlives it, its persistent cookies (a sign-in
 * kept with "Remember me?", a browser remembered for two-factor sign-in) and its local storage, and forgets its
 * session cookies. Open a page afterwards to see what the app makes of it.
 *
 * Example #1: When I close the browser and open it again
 * Example #2: When we close the browser and open it again
 * Example #3: And I close the browser and open it again
 * Example #4: When I close the browser and open it again
 * Example #5: Then we close the browser and open it again
 */
When(/^(I |we )*close the browser and open it again$/, async function (pronounCase) {
  const state = await this.page.context().storageState();
  state.cookies = state.cookies.filter((cookie) => cookie.expires > 0);
  this.__sessionKey = null;
  await this.replaceContext({ storageState: state });
  trackAskedFor(this);
});

/**
 * Let the session end, as the app sees it once its sign-in cookie is no good any more (its time is up, or the keys
 * that protect it changed): the browser keeps a sign-in cookie, but one the app never issued. Open a page
 * afterwards to see what the app makes of it.
 *
 * Example #1: When my session expires
 * Example #2: When our session expires
 * Example #3: And my session expires
 * Example #4: When my session expires
 * Example #5: Then our session expires
 */
When(/^(?:my|our) session expires$/, async function () {
  const name = sessionCookieName(this);
  const cookie = await cookieNamed(this, name);
  if (!cookie) {
    throw friendly({ message: `The browser holds no session cookie ("${name}"), so there is no session to expire.`, hint: 'Log in first, or set worldParameters.sessionCookie to the name of the app\'s sign-in cookie (.AspNetCore.Identity.Application by default).' });
  }
  forgetSession(this);
  const unknown = 'CfDJ8' + crypto.randomUUID().replace(/-/g, '');
  await this.page.context().addCookies([{ ...cookie, value: unknown }]);
});

/**
 * Assert that the page a visitor asked for opens after the login: the app sent the browser to the login page instead
 * of it (with the page in its ReturnUrl), and the login brought the browser back to it.
 *
 * Example #1: Then I should be back on the page I asked for
 * Example #2: Then we should be back on the page we asked for
 * Example #3: And I should be back on the page I asked for
 * Example #4: Then I should be back on the page I asked for
 * Example #5: And we should be back on the page we asked for
 */
Then(/^(I |we )*should be back on the page (?:I|we) asked for$/, async function (pronounCase) {
  const asked = this.__askedFor;
  if (!asked) {
    throw friendly({ message: 'No page sent the browser to the login page in this scenario, so no page was asked for.', hint: 'Open a page that needs a session as a visitor first (I go to "/Movies"), then log in.' });
  }
  await settle(this);
  if (!isOnPath(this, asked.split('?')[0])) {
    throw friendly({ message: `Expected the page asked for before the login (${asked}), but the browser shows ${await describePage(this)}.`, hint: 'The app keeps the page a visitor asked for in the ReturnUrl of the login page and opens it after the login; a login started on the login page itself goes to the home page.' });
  }
});

/**
 * Assert a flag of the session cookie (`worldParameters.sessionCookie`, the sign-in cookie) or of the anti-forgery
 * cookie (`.AspNetCore.Antiforgery.<id>`), as the app set it: HttpOnly (out of reach of the page's scripts) or Secure
 * (sent over HTTPS only).
 *
 * Example #1: Then the session cookie should be HttpOnly
 * Example #2: Then the session cookie should be Secure
 * Example #3: And the anti-forgery cookie should be HttpOnly
 * Example #4: Then the anti-forgery cookie should not be Secure
 * Example #5: And the session cookie should not be Secure
 */
Then(/^the (session|anti-forgery) cookie should( not)* be (HttpOnly|Secure)$/, async function (which, notCase, flag) {
  const cookie = which === 'session' ? await cookieNamed(this, sessionCookieName(this)) : await cookieNamed(this, antiforgeryCookiePrefix(this), { prefix: true });
  const name = which === 'session' ? sessionCookieName(this) : `${antiforgeryCookiePrefix(this)}…`;
  if (!cookie) {
    throw friendly({ message: `The browser holds no ${which} cookie ("${name}").`, hint: which === 'session' ? 'Log in first; set worldParameters.sessionCookie to the name of the app\'s sign-in cookie.' : 'Open a page with a form first: the app sets the anti-forgery cookie with the first form it draws.' });
  }
  const has = flag === 'HttpOnly' ? cookie.httpOnly : cookie.secure;
  if (Boolean(notCase) === Boolean(has)) {
    throw friendly({
      message: `The ${which} cookie "${cookie.name}" is ${notCase ? '' : 'not '}${flag} (HttpOnly: ${cookie.httpOnly}, Secure: ${cookie.secure}, SameSite: ${cookie.sameSite}).`,
      hint: which === 'session' ? 'Behind a proxy that ends HTTPS the app must read its forwarded headers (ASPNETCORE_FORWARDEDHEADERS_ENABLED) to mark its cookies Secure; ConfigureApplicationCookie sets the sign-in cookie\'s flags.' : 'The anti-forgery cookie takes its flags from AddAntiforgery(options => options.Cookie.SecurePolicy = CookieSecurePolicy.Always); the default (None) leaves it without Secure.',
    });
  }
});

/**
 * Assert the SameSite value of the session cookie or of the anti-forgery cookie: Lax (sent when a person follows a
 * link to the site, not with a form another site posts), Strict, or None.
 *
 * Example #1: Then the session cookie should be SameSite Lax
 * Example #2: Then the anti-forgery cookie should be SameSite Strict
 * Example #3: And the session cookie should be SameSite Lax
 * Example #4: Then the anti-forgery cookie should be SameSite Strict
 * Example #5: And the session cookie should be SameSite Strict
 */
Then(/^the (session|anti-forgery) cookie should be SameSite (Lax|Strict|None)$/, async function (which, value) {
  const cookie = which === 'session' ? await cookieNamed(this, sessionCookieName(this)) : await cookieNamed(this, antiforgeryCookiePrefix(this), { prefix: true });
  if (!cookie) {
    throw friendly({ message: `The browser holds no ${which} cookie.`, hint: which === 'session' ? 'Log in first.' : 'Open a page with a form first.' });
  }
  if (cookie.sameSite !== value) {
    throw friendly({ message: `The ${which} cookie "${cookie.name}" is SameSite ${cookie.sameSite}, not ${value}.`, hint: 'The app sets SameSite on its cookies through their options (ConfigureApplicationCookie, AddAntiforgery).' });
  }
});

/**
 * Assert how long the session cookie keeps the browser signed in: a number of days (with "Remember me?" ticked the
 * sign-in cookie lasts 14 days by default), give or take an hour, or only as long as the browser (no expiry).
 *
 * Example #1: Then the session cookie should last 14 days
 * Example #2: Then the session cookie should end with the browser
 * Example #3: And the session cookie should last 14 days
 * Example #4: Then the session cookie should last 1 day
 * Example #5: And the session cookie should end with the browser
 */
Then(/^the session cookie should (?:last (\d+) days?|end with the browser)$/, async function (days) {
  const name = sessionCookieName(this);
  const cookie = await cookieNamed(this, name);
  if (!cookie) {
    throw friendly({ message: `The browser holds no session cookie ("${name}").`, hint: 'Log in first; set worldParameters.sessionCookie to the name of the app\'s sign-in cookie.' });
  }
  // A group that took no part in the match comes as null.
  if (days === undefined || days === null || days === '') {
    if (cookie.expires > 0) {
      const left = (cookie.expires * 1000 - Date.now()) / 86400000;
      throw friendly({ message: `The session cookie "${name}" lasts ${left.toFixed(2)} days: it outlives the browser.`, hint: 'A login without "Remember me?" gives a session cookie, which ends with the browser.' });
    }
    return;
  }
  if (cookie.expires <= 0) {
    throw friendly({ message: `The session cookie "${name}" ends with the browser: it has no expiry.`, hint: 'Tick "Remember me?" on the login form: the sign-in cookie then outlives the browser.' });
  }
  const left = (cookie.expires * 1000 - Date.now()) / 86400000;
  if (Math.abs(left - Number(days)) > 1 / 24) {
    throw friendly({ message: `The session cookie "${name}" lasts ${left.toFixed(2)} days, not ${days}.`, hint: 'ConfigureApplicationCookie(options => options.ExpireTimeSpan = ...) sets it (14 days by default).' });
  }
});

module.exports = { submitLogin, enterCode, onCodePage, openLoginForm, refusalMessages, keepSession, setCheckbox };
