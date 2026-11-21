'use strict';

// Two-factor sign-in with an authenticator app: the page that asks for the code after the password (LoginWith2fa),
// a code worked out from the account's key the way an authenticator app does (RFC 6238: HMAC-SHA1, six digits, a
// new code every 30 seconds), a wrong code, "Remember this machine", and on the Manage pages the set-up of an
// authenticator app (the key the page shows, the code it is verified with, the recovery codes), turning two-factor
// sign-in off, and a browser that is remembered.
//
// The key of an account the build set up is in the users registry (`otpSecret`, base32); the key of a set-up made in
// a scenario is read from the page that shows it ("Scan the QR Code or enter this key ... into your two factor
// authenticator app"), as a person types it into the app.

const { After, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');
const { submitLogin, enterCode, onCodePage, refusalMessages, keepSession, setCheckbox } = require('./aspnet-core-session.steps');

const CODE_FIELD = 'input[name$="TwoFactorCode"]';

/** The handle of the account the scenario is signing in as, or signed in as last. */
function currentHandle(world) {
  return world.__loginAttempt || null;
}

/** The key of an account's authenticator app: one set up in this scenario, else the registry's. */
function keyOf(world, handle) {
  const account = h.resolveUser(world, handle);
  if (!account.otpSecret) {
    throw friendly({ message: `The users registry has no otpSecret for "${handle}", and no authenticator app was set up for it in this scenario.`, hint: `Set worldParameters.users.${handle}.otpSecret in cucumber.js to the account's key (base32), or set one up first (I set up two-factor authentication with an authenticator app).` });
  }
  return account.otpSecret;
}

/**
 * Assert that the browser shows the page that asks for the code of an authenticator app after the password (the
 * account page LoginWith2fa, "Your login is protected with an authenticator app. Enter your authenticator code
 * below.").
 *
 * Example #1: Then I should be asked for the authenticator code
 * Example #2: Then I should be asked for a one-time code
 * Example #3: And we should be asked for the authenticator code
 * Example #4: Then I should be asked for the one-time code
 * Example #5: And I should be asked for an authenticator code
 */
Then(/^(I |we )*should be asked for (?:a|an|the) (?:one-time|authenticator) code$/, async function (pronounCase) {
  await h.settle(this);
  if (!(await onCodePage(this))) {
    throw friendly({ message: `Expected the page that asks for the code of an authenticator app (${h.accountPage(this, 'LoginWith2fa')}), but the browser shows ${await h.describePage(this)}.`, hint: 'The app asks for a code after the password of an account with two-factor sign-in, unless this browser is remembered for it ("Remember this machine").' });
  }
});

/**
 * Type the code of an account's authenticator app on the page that asks for it, worked out from its key (the
 * registry's `otpSecret`, or the key of a set-up made in this scenario), and send it. "Remember this machine" can be
 * ticked on the way.
 *
 * Example #1: When I enter the authenticator code of "twofactoruser"
 * Example #2: When I enter the one-time code of "twofactoruser"
 * Example #3: And we enter the authenticator code of "user"
 * Example #4: When I enter the authenticator code of "twofactoruser" with "Remember this machine" checked
 * Example #5: When I enter the one-time code of "twofactoruser" with "Remember this machine" unchecked
 */
When(/^(I |we )*enter the (?:one-time|authenticator) code of "([^"]*)"(?: with "([^"]*)" (checked|unchecked))?$/, async function (pronounCase, handle, checkbox, state) {
  if (!(await onCodePage(this))) {
    throw friendly({ message: `There is no page asking for a code on screen (${await h.describePage(this)}).`, hint: 'Submit the login form of an account with two-factor sign-in first (I submit the login form as "...").' });
  }
  const form = this.page.locator(`form:has(${CODE_FIELD})`).first();
  await form.locator(CODE_FIELD).fill(h.totp(keyOf(this, handle)));
  if (checkbox) await setCheckbox(this, form, checkbox, state === 'checked');
  const submit = form.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
  await h.pressAndWait(this, submit, { label: `Sending the code of "${handle}"` });
  if (!(await onCodePage(this)) && !(await h.onLoginPage(this))) await keepSession(this, h.resolveUser(this, handle));
});

/**
 * Type a code of one's own on the page that asks for the code of an authenticator app, and send it: a wrong code,
 * for the refusal.
 *
 * Example #1: When I enter the authenticator code "000000"
 * Example #2: When I enter the one-time code "123456"
 * Example #3: And we enter the authenticator code "999999"
 * Example #4: When I enter the authenticator code "12345"
 * Example #5: When I enter the one-time code "000000"
 */
When(/^(I |we )*enter the (?:one-time|authenticator) code "([^"]*)"$/, async function (pronounCase, code) {
  if (!(await onCodePage(this))) {
    throw friendly({ message: `There is no page asking for a code on screen (${await h.describePage(this)}).`, hint: 'Submit the login form of an account with two-factor sign-in first (I submit the login form as "...").' });
  }
  await enterCode(this, code);
});

/**
 * Assert that a code was refused: the page that asks for it is back, with its reason ("Invalid authenticator code.").
 *
 * Example #1: Then the authenticator code should be refused with "Invalid authenticator code."
 * Example #2: Then the one-time code should be refused with "Invalid authenticator code."
 * Example #3: And the authenticator code should be refused with "Invalid authenticator code."
 * Example #4: Then the authenticator code should be refused with "Invalid authenticator code"
 * Example #5: But the one-time code should be refused with "Invalid authenticator code."
 */
Then(/^the (?:one-time|authenticator) code should be refused with "([^"]*)"$/, async function (message) {
  await h.settle(this);
  if (!(await onCodePage(this))) {
    throw friendly({ message: `Expected the code to be refused, but the browser left the page of the code: ${await h.describePage(this)}.`, hint: 'A refused code comes back to the page that asks for it, with its reason.' });
  }
  const messages = await refusalMessages(this);
  const wanted = h.clean(message).replace(/[.!]$/, '').toLowerCase();
  if (!messages.some((m) => h.clean(m).replace(/^error:\s*/i, '').replace(/[.!]$/, '').toLowerCase() === wanted)) {
    throw friendly({ message: `The page of the code does not say "${message}". It says: ${h.listed(messages)}.`, hint: 'Name the message as the page writes it ("Invalid authenticator code.").' });
  }
});

// ---------------------------------------------------------------------------
// The set-up on the Manage pages
// ---------------------------------------------------------------------------

/** Open the Manage page of two-factor authentication. */
async function openTwoFactorPage(world) {
  await h.open(world, h.siteUrl(world, h.accountPage(world, 'Manage/TwoFactorAuthentication')));
  if (await h.onLoginPage(world)) {
    throw friendly({ message: 'The Manage pages sent the browser to the login page: nobody is logged in.', hint: 'Log in first (I am a logged in user with the "..." user).' });
  }
}

/** The handle of the signed-in account, by the email the navigation shows; '' when the registry does not know it. */
async function signedInHandle(world) {
  const manage = h.accountPage(world, 'Manage').toLowerCase();
  const names = await world.page.evaluate((managePath) => [...document.querySelectorAll('a[href]')].filter((a) => {
    try { return new URL(a.getAttribute('href'), document.baseURI).pathname.replace(/\/+$/, '').toLowerCase() === managePath; } catch { return false; }
  }).map((a) => a.textContent), manage).catch(() => []);
  for (const text of names) {
    for (const word of String(text).split(/[\s!,]+/)) {
      const handle = h.handleOf(world, word);
      if (handle) return handle;
    }
  }
  return world.__loginAttempt || '';
}

/** Open the page that shows the key of the authenticator app: the one link of the two-factor page that sets it up. */
async function openSetUpPage(world) {
  if (h.isOnAccountPage(world, 'Manage/EnableAuthenticator')) return;
  await openTwoFactorPage(world);
  // "Add authenticator app" for an account without a key, "Set up authenticator app" once it has one.
  const link = world.page.getByRole('link', { name: /^(Add|Set up) authenticator app$/i }).first();
  if (!(await link.count())) {
    const links = await world.page.locator('main a, main button').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    throw friendly({ message: `The two-factor page has no link to set up an authenticator app. It has: ${h.listed(links)}.`, hint: 'The page offers "Add authenticator app" (or "Set up authenticator app" once the account has a key).' });
  }
  await h.navigating(world, () => link.click(), { label: 'Opening the set-up of an authenticator app' });
}

/** The key the set-up page shows ("enter this key xxxx xxxx ... into your two factor authenticator app"). */
async function shownKey(world) {
  const kbd = world.page.locator('main kbd').first();
  if (await kbd.count()) return (await kbd.textContent()).trim();
  const fromQr = await world.page.locator('[data-url^="otpauth://"]').first().getAttribute('data-url').catch(() => null);
  const secret = fromQr && new URL(fromQr).searchParams.get('secret');
  if (secret) return secret;
  throw friendly({ message: `The set-up page shows no key (${await h.describePage(world)}).`, hint: 'The page writes the key of the authenticator app in a <kbd> element, and in the otpauth:// address of its QR code.' });
}

/** Send a code on the set-up page ("Verification Code", "Verify"). */
async function verifyWith(world, code) {
  await (await h.findField(world, 'Verification Code')).fill(code);
  await h.pressAndWait(world, await h.buttonNamed(world, 'Verify'), { label: 'Verifying the authenticator app' });
}

// A scenario that turned two-factor sign-in on for an account and did not turn it off leaves it on for the rest of
// the run: this puts it back in a browser of its own, with the code of the key the scenario set up.
After(async function () {
  const pending = this.__twoFactorTurnedOn;
  this.__twoFactorTurnedOn = null;
  if (!pending) return;
  const context = await this.playwrightBrowser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const world = Object.create(this, { page: { value: page }, __changed: { value: this.__changed } });
  try {
    const account = h.resolveUser(world, pending.handle);
    const result = await submitLogin(world, account.login, account.password);
    if (result.outcome === 'code') await enterCode(world, h.totp(pending.key));
    await h.open(world, h.siteUrl(world, h.accountPage(world, 'Manage/Disable2fa')));
    const button = await h.buttonNamed(world, 'Disable 2FA');
    await h.pressAndWait(world, button, { label: 'Turning two-factor sign-in off again' });
    h.forgetSessionsOf(world, account.login);
  } catch (err) {
    console.warn(`[aspnet-core-steps] Could not turn two-factor sign-in of "${pending.handle}" off again: ${err.message}. Put the accounts back with the build (ACCOUNTS_ONLY=1, or cmd-tools-aspnet-core-cli.sh <app> --add-users).`);
  } finally {
    await context.close().catch(() => {});
  }
});

/**
 * Set up an authenticator app for the signed-in account on its Manage pages, as a person does: the link of the
 * two-factor page ("Add authenticator app", or "Set up authenticator app"), the key the page shows typed into the
 * app (the step works the code out from it), the code verified. The page then says "Your authenticator app has been
 * verified." and shows the recovery codes. The key is kept for the rest of the scenario: a login of the account
 * types its codes. Turn it off again before the scenario ends ("I turn two-factor authentication off"); a scenario
 * that does not is put back after it.
 *
 * Example #1: When I set up two-factor authentication with an authenticator app
 * Example #2: When we set up two-factor authentication with an authenticator app
 * Example #3: And I set up two-factor authentication with an authenticator app
 * Example #4: When I set up two-factor authentication with an authenticator app
 * Example #5: Then we set up two-factor authentication with an authenticator app
 */
When(/^(I |we )*set up two-factor authentication with an authenticator app$/, async function (pronounCase) {
  await openSetUpPage(this);
  const handle = await signedInHandle(this);
  const key = await shownKey(this);
  // From the moment the code is sent, two-factor sign-in may be on: the scenario is put back after it if it fails.
  if (handle) this.__twoFactorTurnedOn = { handle, key };
  await verifyWith(this, h.totp(key));
  // A refusal comes back to the set-up page with its reason and the code field; a set-up that worked shows the
  // recovery codes (on the page of its own, or in place of the form in a Blazor Web App) or goes to the two-factor page.
  const errors = [...(await h.formErrors(this)), ...(await h.refusedFields(this)).flatMap((f) => f.errors)];
  const stillAsking = h.isOnAccountPage(this, 'Manage/EnableAuthenticator') && (await this.page.locator('form input[name$="Code"]').count()) > 0;
  if (errors.length || stillAsking) {
    if (errors.length) this.__twoFactorTurnedOn = null;
    throw friendly({ message: `The app refused the code worked out from the key it showed: ${h.listed(errors)}.`, hint: 'Check that the clock of this machine is right: a code is valid for one window of 30 seconds (the app accepts the windows next to it).' });
  }
  if (handle) {
    h.accountChanged(this, handle, { otpSecret: key.replace(/\s+/g, '').toUpperCase() });
    h.forgetSessionsOf(this, h.resolveUser(this, handle).login);
  }
});

/**
 * Send a code of one's own on the set-up page of an authenticator app (it is opened from the two-factor page when it
 * is not on screen): a wrong code, for the refusal ("Verification code is invalid.").
 *
 * Example #1: When I verify the authenticator app with the code "123456"
 * Example #2: When we verify the authenticator app with the code "000000"
 * Example #3: And I verify the authenticator app with the code "999999"
 * Example #4: When I verify the authenticator app with the code "12345"
 * Example #5: When I verify the authenticator app with the code ""
 */
When(/^(I |we )*verify the authenticator app with the code "([^"]*)"$/, async function (pronounCase, code) {
  await openSetUpPage(this);
  await verifyWith(this, code);
});

/**
 * Turn two-factor sign-in off for the signed-in account: the page "Disable two-factor authentication (2FA)" of its
 * Manage pages and its button "Disable 2FA". The page then says "2fa has been disabled."
 *
 * Example #1: When I turn two-factor authentication off
 * Example #2: When we turn two-factor authentication off
 * Example #3: And I turn two-factor authentication off
 * Example #4: When I turn two-factor authentication off
 * Example #5: Then we turn two-factor authentication off
 */
When(/^(I |we )*turn two-factor authentication off$/, async function (pronounCase) {
  await openTwoFactorPage(this);
  const link = this.page.getByRole('link', { name: 'Disable 2FA', exact: true });
  if (!(await link.count())) {
    throw friendly({ message: 'The two-factor page offers no "Disable 2FA": two-factor sign-in is off for this account.', hint: 'Set it up first (I set up two-factor authentication with an authenticator app).' });
  }
  await h.navigating(this, () => link.first().click(), { label: 'Opening the page that turns two-factor sign-in off' });
  await h.pressAndWait(this, await h.buttonNamed(this, 'Disable 2FA'), { label: 'Turning two-factor sign-in off' });
  this.__twoFactorTurnedOn = null;
});

/**
 * Assert whether two-factor sign-in is on for the signed-in account, as its two-factor page shows it: on, the page
 * offers "Disable 2FA"; off, it does not.
 *
 * Example #1: Then two-factor authentication should be on
 * Example #2: Then two-factor authentication should be off
 * Example #3: And two-factor authentication should be on
 * Example #4: And two-factor authentication should be off
 * Example #5: But two-factor authentication should be off
 */
Then(/^two-factor authentication should be (on|off)$/, async function (state) {
  await openTwoFactorPage(this);
  const on = (await this.page.getByRole('link', { name: 'Disable 2FA', exact: true }).count()) > 0;
  if (on !== (state === 'on')) {
    const text = h.clean(await this.page.locator('main').innerText().catch(() => ''));
    throw friendly({ message: `Two-factor sign-in is ${on ? 'on' : 'off'} for this account, not ${state}. The two-factor page says: "${text.slice(0, 300)}".`, hint: on ? 'Turn it off with "I turn two-factor authentication off".' : 'Set it up with "I set up two-factor authentication with an authenticator app".' });
  }
});

/**
 * Assert the recovery codes the page shows after a set-up (or after "Reset recovery codes"): their number, each a
 * code of its own.
 *
 * Example #1: Then I should see 10 recovery codes
 * Example #2: Then we should see 10 recovery codes
 * Example #3: And I should see 10 recovery codes
 * Example #4: Then I should see 5 recovery codes
 * Example #5: And we should see 10 recovery codes
 */
Then(/^(I |we )*should see (\d+) recovery codes?$/, async function (pronounCase, count) {
  await h.settle(this);
  const codes = await this.page.locator('main code').evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean)).catch(() => []);
  const distinct = new Set(codes);
  if (codes.length !== Number(count) || distinct.size !== codes.length) {
    throw friendly({ message: `Expected ${count} recovery codes, each of its own, but the page shows ${codes.length}${distinct.size !== codes.length ? ' (some twice)' : ''} (${await h.describePage(this)}).`, hint: 'The recovery codes are shown once, right after the set-up of an authenticator app or "Reset recovery codes".' });
  }
});

/**
 * Assert that this browser is, or is not, remembered for two-factor sign-in ("Remember this machine" on the page of
 * the code): the app keeps a cookie for it (`worldParameters.twoFactorRememberCookie`), and asks the account for no
 * code in this browser while it lasts. "Forget this browser" on the two-factor page takes it away.
 *
 * Example #1: Then this browser should be remembered for two-factor sign-in
 * Example #2: Then this browser should not be remembered for two-factor sign-in
 * Example #3: And this browser should be remembered for two-factor sign-in
 * Example #4: And this browser should not be remembered for two-factor sign-in
 * Example #5: But this browser should not be remembered for two-factor sign-in
 */
Then(/^this browser should( not)* be remembered for two-factor sign-in$/, async function (notCase) {
  const name = h.twoFactorRememberCookieName(this);
  const cookie = await h.cookieNamed(this, name);
  if (notCase && cookie) {
    throw friendly({ message: `This browser holds the cookie "${name}": it is remembered for two-factor sign-in.`, hint: 'Press "Forget this browser" on the two-factor page of the account.' });
  }
  if (!notCase && !cookie) {
    throw friendly({ message: `This browser holds no cookie "${name}": it is not remembered for two-factor sign-in.`, hint: 'Tick "Remember this machine" on the page of the code (I enter the authenticator code of "..." with "Remember this machine" checked).' });
  }
});
