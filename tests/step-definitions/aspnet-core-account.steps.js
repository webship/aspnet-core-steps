'use strict';

// The account pages around the login: a forgotten password and its reset through the mail, the confirmation mail
// sent again, registration (its refusals only: a suite never creates an account), the Lockout and Access denied
// pages, and the Manage pages of a signed-in account (profile, email, password, two-factor authentication, personal
// data), with the status message each of them shows after a change.
//
// A scenario that changes the password or the email of an account changes it back before it ends ("I change my
// password back", "I change my email back"); one that does not is put back after it, through the same pages.

const { After, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');
const { submitLogin, enterCode } = require('./aspnet-core-session.steps');
const { waitForMail } = require('./aspnet-core-mail.steps');

/** Open an account page, and fail with a friendly error when the app sends a visitor to the login page instead. */
async function openAccountPage(world, name) {
  await h.open(world, h.siteUrl(world, h.accountPage(world, name)));
  if (name.startsWith('Manage') && (await h.onLoginPage(world))) {
    throw friendly({ message: `The page ${h.accountPage(world, name)} sent the browser to the login page: nobody is logged in.`, hint: 'Log in first (I am a logged in user with the "..." user).' });
  }
}

/** Fill a field by its label and press the button of its form, as a person does. */
async function fillAndSend(world, values, buttonWords, label) {
  let form = null;
  for (const [field, value] of values) {
    const input = await h.findField(world, field);
    await input.fill(value);
    form = form || input.locator('xpath=ancestor::form[1]');
  }
  const button = buttonWords ? await h.buttonNamed(world, buttonWords, { within: form || undefined }) : form.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
  await h.pressAndWait(world, button, { label });
}

/** The handle of the account signed in, read from the email the navigation shows, else the last login of the scenario. */
async function signedInHandle(world) {
  const manage = h.accountPage(world, 'Manage').toLowerCase();
  const names = await world.page.evaluate((managePath) => [...document.querySelectorAll('a[href]')].filter((a) => {
    try { return new URL(a.getAttribute('href'), document.baseURI).pathname.replace(/\/+$/, '').toLowerCase() === managePath; } catch { return false; }
  }).map((a) => a.textContent), manage).catch(() => []);
  for (const text of names) {
    for (const word of String(text).split(/[\s!,]+/)) {
      const handle = h.handleOf(world, word) || Object.keys((world.__changed || {})).find((k) => (world.__changed[k].email || '').toLowerCase() === word.toLowerCase());
      if (handle) return handle;
    }
  }
  if (world.__loginAttempt) return world.__loginAttempt;
  throw friendly({ message: `The registry knows no account shown in the navigation (${h.listed(names)}).`, hint: 'Log in with a handle of worldParameters.users first.' });
}

// ---------------------------------------------------------------------------
// A forgotten password, the confirmation mail
// ---------------------------------------------------------------------------

/**
 * Ask for a password reset link for an account of the registry (its email) or an address, on the account page
 * ForgotPassword ("Forgot your password?"), as a visitor does. The app answers every address the same way ("Please
 * check your email to reset your password.") and mails a link to a confirmed account only.
 *
 * Example #1: When I ask for a password reset link for "user"
 * Example #2: When we ask for a password reset link for "nobody@example.com"
 * Example #3: And I ask for a password reset link for "unconfirmeduser"
 * Example #4: When I ask for a password reset link for "user@example.com"
 * Example #5: When I ask for a password reset link for "administrator"
 */
When(/^(I |we )*ask for a password reset link for "([^"]*)"$/, async function (pronounCase, who) {
  await openAccountPage(this, 'ForgotPassword');
  await fillAndSend(this, [['Email', h.addressOf(this, who)]], null, 'Asking for a password reset link');
});

/**
 * On the page the reset link of the mail opened (ResetPassword), reset the password of an account of the registry
 * to the password the registry has for it (so the account keeps the password the suite knows): its email, the
 * password and its confirmation, then "Reset". The page then says "Your password has been reset."
 *
 * Example #1: When I reset the password of "user" on the reset page
 * Example #2: When we reset the password of "administrator" on the reset page
 * Example #3: And I reset the password of "user" on the reset page
 * Example #4: When I reset the password of "twofactoruser" on the reset page
 * Example #5: Then we reset the password of "user" on the reset page
 */
When(/^(I |we )*reset the password of "([^"]*)" on the reset page$/, async function (pronounCase, handle) {
  const account = h.resolveUser(this, handle);
  if (!h.isOnAccountPage(this, 'ResetPassword')) {
    throw friendly({ message: `The reset page is not on screen (${await h.describePage(this)}).`, hint: 'Open the link of the reset mail first (I open the "clicking here" link of the email to "...").' });
  }
  const form = this.page.locator('form:has(input[type="password"])').first();
  await (await h.findField(this, 'Email', { within: form })).fill(account.email);
  const passwords = form.locator('input[type="password"]');
  if ((await passwords.count()) < 2) throw friendly({ message: 'The reset page has no password and confirmation fields.', hint: 'The reset page asks for the email, the new password and its confirmation.' });
  await passwords.nth(0).fill(account.registryPassword);
  await passwords.nth(1).fill(account.registryPassword);
  await h.pressAndWait(this, form.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first(), { label: 'Resetting the password' });
  h.forgetSessionsOf(this, account.login);
});

/**
 * Ask the app to send the confirmation mail of an account again (the account page ResendEmailConfirmation, "Resend
 * email confirmation"). The page answers "Verification email sent. Please check your email." for every address, and
 * mails an existing account a link that confirms its email.
 *
 * Example #1: When I ask for a new confirmation email for "unconfirmeduser"
 * Example #2: When we ask for a new confirmation email for "user"
 * Example #3: And I ask for a new confirmation email for "nobody@example.com"
 * Example #4: When I ask for a new confirmation email for "unconfirmeduser@example.com"
 * Example #5: When I ask for a new confirmation email for "user"
 */
When(/^(I |we )*ask for a new confirmation email for "([^"]*)"$/, async function (pronounCase, who) {
  await openAccountPage(this, 'ResendEmailConfirmation');
  await fillAndSend(this, [['Email', h.addressOf(this, who)]], null, 'Asking for the confirmation mail again');
});

/**
 * Fill in the registration form (the account page Register) with the values of a table (field | value) and press
 * its button, as a person does. A suite tests registration through its refusals only (a taken address, a weak or a
 * mismatched password, a missing field): it never creates an account.
 *
 * Example #1: When I try to register with:
 * Example #2: When we try to register with:
 * Example #3: And I try to register with:
 * Example #4: When I try to register with:
 * Example #5: Then I try to register with:
 */
When(/^(I |we )*try to register with:$/, async function (pronounCase, table) {
  await openAccountPage(this, 'Register');
  const form = this.page.locator('form:has(input[type="password"])').first();
  for (const [field, value] of table.raw()) {
    await (await h.findField(this, field, { within: form })).fill(value);
  }
  const button = form.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
  // A form the page's own checks refuse is not sent: the step waits for an answer, or for the messages of the page.
  await button.focus().catch(() => {});
  await h.settle(this, 1000);
  const before = this.page.url();
  await Promise.all([
    this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => null),
    button.click(),
  ]);
  await h.settle(this);
  if (h.isOnAccountPage(this, 'RegisterConfirmation') || (!h.isOnAccountPage(this, 'Register') && this.page.url() !== before)) {
    throw friendly({ message: `The registration was accepted (${await h.describePage(this)}): an account was made by the suite.`, hint: 'A suite tests registration through its refusals only: a taken address, a weak or a mismatched password, a missing field. Delete the account it made, or build the app again.' });
  }
});

/**
 * Assert that the browser shows the Lockout page ("Locked out", "This account has been locked out, please try again
 * later."), where the app sends an account that is locked out.
 *
 * Example #1: Then I should see the lockout page
 * Example #2: Then we should see the lockout page
 * Example #3: And I should see the lockout page
 * Example #4: Then I should see the lockout page
 * Example #5: And we should see the lockout page
 */
Then(/^(I |we )*should see the lockout page$/, async function (pronounCase) {
  await h.settle(this);
  const heading = h.clean(await this.page.locator('h1, h2').first().innerText().catch(() => ''));
  if (!h.isOnAccountPage(this, 'Lockout') || !/locked out/i.test(heading)) {
    throw friendly({ message: `Expected the Lockout page (${h.accountPage(this, 'Lockout')}), but the browser shows ${await h.describePage(this)}.`, hint: 'The app sends a locked-out account to its Lockout page after the password; the account must be locked out (its lockout end in the future).' });
  }
});

/**
 * Assert that the browser shows the Access denied page ("Access denied", "You do not have access to this
 * resource."), where the app sends a signed-in account that a page refuses.
 *
 * Example #1: Then I should see the access denied page
 * Example #2: Then we should see the access denied page
 * Example #3: And I should see the access denied page
 * Example #4: Then I should see the access denied page
 * Example #5: And we should see the access denied page
 */
Then(/^(I |we )*should see the access denied page$/, async function (pronounCase) {
  await h.settle(this);
  const heading = h.clean(await this.page.locator('h1, h2').first().innerText().catch(() => ''));
  if (!h.isOnAccountPage(this, 'AccessDenied') || !/access denied/i.test(heading)) {
    throw friendly({ message: `Expected the Access denied page (${h.accountPage(this, 'AccessDenied')}), but the browser shows ${await h.describePage(this)}.`, hint: 'The app sends a signed-in account without the role or the policy a page asks for to its AccessDenied page; a visitor goes to the login page instead.' });
  }
});

// ---------------------------------------------------------------------------
// The Manage pages
// ---------------------------------------------------------------------------

/** The navigation of the Manage pages: its links, by their words, and which one is the active page. */
async function manageNav(world) {
  const manage = h.accountPage(world, 'Manage').toLowerCase();
  return world.page.evaluate((managePath) => {
    const out = [];
    for (const a of document.querySelectorAll('main a[href], nav a[href]')) {
      let target = '';
      try { target = new URL(a.getAttribute('href'), document.baseURI).pathname.replace(/\/+$/, '').toLowerCase(); } catch { continue; }
      if (target !== managePath && !target.startsWith(managePath + '/')) continue;
      if (a.closest('header')) continue;
      const words = a.textContent.replace(/\s+/g, ' ').trim();
      if (!words) continue;
      out.push({ words, active: a.classList.contains('active') || a.getAttribute('aria-current') === 'page', target });
    }
    return out;
  }, manage).catch(() => []);
}

/**
 * Go to a page of the signed-in account's Manage pages by the words of its link ("Profile", "Email", "Password",
 * "Two-factor authentication", "Personal data"), as a person does from the account's page.
 *
 * Example #1: When I go to the "Password" page of my account
 * Example #2: When we go to the "Email" page of my account
 * Example #3: And I go to the "Two-factor authentication" page of my account
 * Example #4: When I go to the "Personal data" page of my account
 * Example #5: When I go to the "Profile" page of my account
 */
When(/^(I |we )*go to the "([^"]*)" page of (?:my|our) account$/, async function (pronounCase, words) {
  await openAccountPage(this, 'Manage');
  const links = await manageNav(this);
  const link = links.find((l) => l.words.toLowerCase() === words.toLowerCase());
  if (!link) {
    throw friendly({ message: `The Manage pages have no "${words}" page. They have: ${h.listed(links.map((l) => l.words))}.`, hint: 'Name the page by the words of its link in the navigation of the Manage pages.' });
  }
  await h.open(this, h.siteUrl(this, link.target));
});

/**
 * Assert which page of the Manage pages is on screen: the active link of their navigation.
 *
 * Example #1: Then I should be on the "Password" page of my account
 * Example #2: Then we should be on the "Email" page of my account
 * Example #3: And I should be on the "Two-factor authentication" page of my account
 * Example #4: Then I should be on the "Profile" page of my account
 * Example #5: And I should be on the "Personal data" page of my account
 */
Then(/^(I |we )*should be on the "([^"]*)" page of (?:my|our) account$/, async function (pronounCase, words) {
  await h.settle(this);
  const links = await manageNav(this);
  const active = links.filter((l) => l.active).map((l) => l.words);
  if (!active.some((w) => w.toLowerCase() === words.toLowerCase())) {
    throw friendly({ message: `Expected the "${words}" page of the account, but ${active.length ? `the "${active[0]}" page is on screen` : `the browser shows ${await h.describePage(this)}`}.`, hint: 'The navigation of the Manage pages marks the page on screen as active.' });
  }
});

/**
 * Assert the status message a page shows after it did something ("Your profile has been updated", "Your password
 * has been changed."): the alert of the Manage pages, a dismissible one with a close button, read without the
 * button. A message that ends with a full stop matches with or without it.
 *
 * Example #1: Then I should see the status message "Your profile has been updated"
 * Example #2: Then I should see the status message "Your password has been changed."
 * Example #3: And we should see the status message "Confirmation link to change email sent. Please check your email."
 * Example #4: Then I should see the status message "Your authenticator app has been verified."
 * Example #5: And I should see the status message "2fa has been disabled. You can reenable 2fa when you setup an authenticator app"
 */
Then(/^(I |we )*should see the status message "([^"]*)"$/, async function (pronounCase, expected) {
  const wanted = h.clean(expected).replace(/[.!]$/, '').toLowerCase();
  let messages = [];
  await h.eventually(this, async () => {
    messages = [...(await h.pageMessages(this)).map((m) => m.text), ...(await h.formErrors(this))];
    return messages;
  }, (list) => list.some((m) => h.clean(m).replace(/[.!]$/, '').toLowerCase() === wanted), () => ({
    message: `The page does not show the status message "${expected}". It shows: ${h.listed(messages)}.`,
    hint: 'Name the message as the page writes it; a page that shows none did not finish what it was asked (look at its field errors).',
  }));
});

// ---------------------------------------------------------------------------
// The password and the email of the signed-in account, and their way back
// ---------------------------------------------------------------------------

/**
 * The three password fields of the Password page, by their labels ("Current password", "New password", "Confirm new
 * password"; a Blazor Web App on .NET 10 writes "Old password" and "Confirm password"), else in the order of the form.
 */
async function passwordPageFields(world) {
  const byLabel = async (labels) => {
    for (const label of labels) {
      const field = world.page.getByLabel(label, { exact: true });
      if (await field.count()) return field.first();
    }
    return null;
  };
  const current = await byLabel(['Current password', 'Old password']);
  const next = await byLabel(['New password']);
  const confirm = await byLabel(['Confirm new password', 'Confirm password']);
  if (current && next && confirm) return [current, next, confirm];
  const inputs = world.page.locator('main form input[type="password"]');
  if ((await inputs.count()) >= 3) return [inputs.nth(0), inputs.nth(1), inputs.nth(2)];
  const labels = await h.visibleFieldLabels(world);
  throw friendly({ message: `The Password page has no current, new and confirmation password fields (${world.page.url()}). The fields are: ${h.listed(labels)}.`, hint: 'The Password page of the Manage pages asks for the current password, the new one and its confirmation.' });
}

/** Change the password of the signed-in account on its Password page, from its current password to another. */
async function changePassword(world, handle, to) {
  const account = h.resolveUser(world, handle);
  await openAccountPage(world, 'Manage/ChangePassword');
  const [current, next, confirm] = await passwordPageFields(world);
  await current.fill(account.password);
  await next.fill(to);
  await confirm.fill(to);
  const button = current.locator('xpath=ancestor::form[1]').locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first();
  await h.pressAndWait(world, button, { label: 'Changing the password' });
  const messages = (await h.pageMessages(world)).map((m) => m.text);
  if (!messages.some((m) => /password has been changed/i.test(m))) {
    const errors = [...(await h.formErrors(world)), ...(await h.refusedFields(world)).flatMap((f) => f.errors)];
    throw friendly({ message: `The app did not change the password of "${handle}": ${h.listed(errors.length ? errors : messages)}.`, hint: 'The new password must keep the app\'s password rules (length, a digit, an upper-case letter, a sign).' });
  }
  h.accountChanged(world, handle, { password: to });
  h.forgetSessionsOf(world, account.login);
}

/**
 * Change the password of the signed-in account on its Password page ("Current password", "New password", "Confirm
 * new password", "Update password"): from the one it has to a new one. The scenario logs in with the new one from
 * then on; change it back before the scenario ends ("I change my password back"), or it is put back after it.
 *
 * Example #1: When I change my password to "Changed-Pass-123"
 * Example #2: When we change our password to "Another-Pass-456"
 * Example #3: And I change my password to "Changed-Pass-123"
 * Example #4: When I change my password to "New.Password.789"
 * Example #5: When we change our password to "Changed-Pass-123"
 */
When(/^(I |we )*change (?:my|our) password to "([^"]*)"$/, async function (pronounCase, to) {
  await changePassword(this, await signedInHandle(this), to);
});

/**
 * Change the password of the signed-in account back to the one the users registry has for it.
 *
 * Example #1: When I change my password back
 * Example #2: When we change our password back
 * Example #3: And I change my password back
 * Example #4: Then I change my password back
 * Example #5: When I change my password back
 */
When(/^(I |we )*change (?:my|our) password back$/, async function (pronounCase) {
  const handle = await signedInHandle(this);
  const account = h.resolveUser(this, handle);
  await changePassword(this, handle, account.registryPassword);
  h.accountChanged(this, handle, { password: null });
});

/**
 * Ask to change the email of the signed-in account on its Email page ("New email", "Change email"). The app mails a
 * confirmation link to the new address and changes nothing until it is opened; opening it ("I open the "clicking
 * here" link of the email to "<new address>"") changes the email, and the name the account logs in with. Change it
 * back before the scenario ends ("I change my email back"), or it is put back after it.
 *
 * Example #1: When I change my email to "user-changed@example.com"
 * Example #2: When we change our email to "someone-else@example.org"
 * Example #3: And I change my email to "user-changed@example.com"
 * Example #4: When I change my email to "user@example.com"
 * Example #5: When I change my email to "not-an-address"
 */
When(/^(I |we )*change (?:my|our) email to "([^"]*)"$/, async function (pronounCase, to) {
  const handle = await signedInHandle(this);
  await openAccountPage(this, 'Manage/Email');
  await fillAndSend(this, [['New email', to]], null, 'Asking to change the email');
  this.__emailChange = { handle, to };
});

/**
 * Change the email of the signed-in account back to the one the users registry has for it, the whole way: the
 * request on its Email page, the confirmation mail to that address, and its link.
 *
 * Example #1: When I change my email back
 * Example #2: When we change our email back
 * Example #3: And I change my email back
 * Example #4: Then I change my email back
 * Example #5: When I change my email back
 */
When(/^(I |we )*change (?:my|our) email back$/, async function (pronounCase) {
  const handle = await signedInHandle(this);
  await changeEmailBack(this, handle);
});

async function changeEmailBack(world, handle) {
  const entry = world.parameters.users[handle];
  await openAccountPage(world, 'Manage/Email');
  const since = Date.now() - 1000;
  await fillAndSend(world, [['New email', entry.email]], null, 'Asking to change the email back');
  world.__emailChange = { handle, to: entry.email };
  const found = await h.eventually(world, async () => (await h.mailTo(world, entry.email)).filter((m) => Date.parse(m.Created) >= since && /confirm/i.test(m.Subject)), (list) => list.length > 0, () => ({
    message: `No confirmation mail came to ${entry.email} for the change back.`,
    hint: 'The app mails the confirmation link of a new address to that address; check its email sender.',
  }));
  const link = h.mailLinks(await h.mailMessage(world, found[0].ID)).find((l) => /ConfirmEmailChange/i.test(l.href));
  if (!link) throw friendly({ message: `The mail to ${entry.email} has no link that confirms the change of email.`, hint: 'The link of the mail opens the ConfirmEmailChange page.' });
  await h.open(world, link.href);
  await h.noteConfirmedEmailChange(world);
}

// A scenario that changed the password or the email of an account and did not change it back leaves the account so
// for the rest of the run: this puts it back, in a browser of its own, through the same pages.
After(async function () {
  const changed = this.__changed || {};
  for (const [handle, change] of Object.entries(changed)) {
    if (!change.password && !change.email) continue;
    const context = await this.playwrightBrowser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const world = Object.create(this, { page: { value: page } });
    try {
      const account = h.resolveUser(world, handle);
      const result = await submitLogin(world, account.login, account.password);
      if (result.outcome === 'code' && account.otpSecret) await enterCode(world, h.totp(account.otpSecret));
      if (change.email) await changeEmailBack(world, handle);
      if (change.password) await changePassword(world, handle, account.registryPassword);
      h.forgetSessionsOf(world, account.login);
    } catch (err) {
      console.warn(`[aspnet-core-steps] Could not put the account "${handle}" back: ${err.message}. Put the accounts back with the build (ACCOUNTS_ONLY=1, or cmd-tools-aspnet-core-cli.sh <app> --add-users).`);
    } finally {
      await context.close().catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// Personal data
// ---------------------------------------------------------------------------

/**
 * Download the personal data of the signed-in account from its Personal data page (the button "Download"). The file
 * is kept where webship-js's download steps read it (`the downloaded file name should be "PersonalData.json"`, `the
 * downloaded file should contain:`).
 *
 * Example #1: When I download my personal data
 * Example #2: When we download our personal data
 * Example #3: And I download my personal data
 * Example #4: Then I download my personal data
 * Example #5: When I download my personal data
 */
When(/^(I |we )*download (?:my|our) personal data$/, async function (pronounCase) {
  await openAccountPage(this, 'Manage/PersonalData');
  const button = await h.buttonNamed(this, 'Download');
  await h.keepDownload(this, () => button.click(), { label: 'The "Download" button of the personal data', hint: 'The Personal data page posts its form and the app answers with a file (PersonalData.json).' });
});

/**
 * Assert a value of the personal data downloaded last: its field ("Email", "UserName", "TwoFactorEnabled") and the
 * value the file gives it, as text.
 *
 * Example #1: Then my personal data should show "Email" as "user@example.com"
 * Example #2: Then our personal data should show "EmailConfirmed" as "True"
 * Example #3: And my personal data should show "TwoFactorEnabled" as "False"
 * Example #4: Then my personal data should show "UserName" as "user@example.com"
 * Example #5: And my personal data should show "PhoneNumber" as "null"
 */
Then(/^(?:my|our) personal data should show "([^"]*)" as "([^"]*)"$/, async function (field, expected) {
  const download = this._lastDownload;
  if (!download) throw friendly({ message: 'No personal data was downloaded in this scenario.', hint: 'Download it first (I download my personal data).' });
  let data;
  try {
    data = JSON.parse(download.content.toString('utf8'));
  } catch (err) {
    throw friendly({ message: `The downloaded file ${download.filename} is not JSON.`, cause: err, hint: 'The Personal data page gives a JSON file (PersonalData.json).' });
  }
  if (!(field in data)) throw friendly({ message: `The personal data has no "${field}". It has: ${h.listed(Object.keys(data))}.`, hint: 'Name the field as the file writes it.' });
  if (String(data[field]) !== expected) throw friendly({ message: `The personal data shows "${field}" as "${data[field]}", not "${expected}".`, hint: 'The file holds the values the app keeps for the account now.' });
});

module.exports = { signedInHandle };
