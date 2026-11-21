'use strict';

// The mail the app sends (the confirmation of an account or of a new email address, a password reset), read from
// the mail catcher of the site (worldParameters.mailUrl, a Mailpit): a mail that came to an account, what it says, and
// its links. A step reads the mail that came since the scenario started: never a mail of an earlier scenario or run.

const { Before, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');

Before(function () {
  this.__scenarioStartedAt = Date.now();
});

/** The moment from which a mail step reads the mailbox (a second earlier: the clocks of the app and the machine). */
function mailSince(world) {
  return (world.__scenarioStartedAt || 0) - 1000;
}

/** Whether a text holds another, white space and letter case aside. */
function mentions(text, part) {
  return h.clean(text).toLowerCase().includes(h.clean(part).toLowerCase());
}

/** The newest mail to an address with a subject since the scenario began, waiting for it to come. */
async function waitForMail(world, address, subject) {
  let seen = [];
  return h.eventually(world, async () => {
    const all = await h.mailTo(world, address);
    seen = all.filter((m) => Date.parse(m.Created) >= mailSince(world));
    return seen.find((m) => mentions(m.Subject, subject)) || null;
  }, (m) => !!m, () => ({
    message: `No mail "${subject}" came to ${address} in this scenario${seen.length ? `; it got ${h.listed(seen.map((m) => m.Subject))}` : ''}.`,
    hint: `The app sends its mail to the mail catcher (${h.mailUrl(world)}); check the app's email sender (its SMTP host and port) and the mail catcher's own list. The default account pages send a reset only to an account whose email is confirmed.`,
  }), h.budget(world));
}

/**
 * A mail with a subject came to an account of the users registry (its email) or to an address, since the scenario
 * began.
 *
 * Example #1: Then an email with the subject "Reset your password" should be sent to "user"
 * Example #2: Then an email with the subject "Confirm your email" should be sent to "unconfirmeduser"
 * Example #3: Then an email with the subject "Reset your password" should be sent to "user@example.com"
 * Example #4: And an email with the subject "Confirm your email" should be sent to "user-changed@example.com"
 * Example #5: Then an email with the subject "Confirm" should be sent to "user"
 */
Then(/^an email with the subject "([^"]*)" should be sent to "([^"]*)"$/, async function (subject, who) {
  await waitForMail(this, h.addressOf(this, who), subject);
});

/**
 * No mail came to an address since the scenario began (the app answers a password reset for an unknown or an
 * unconfirmed address as for a known one, and sends nothing). The step waits a moment for a mail that is late.
 *
 * Example #1: Then no email should be sent to "nobody@example.com"
 * Example #2: Then no email should be sent to "unconfirmeduser"
 * Example #3: And no email should be sent to "nobody@example.com"
 * Example #4: Then no email should be sent to "someone-else@example.org"
 * Example #5: But no email should be sent to "nobody@example.com"
 */
Then(/^no email should be sent to "([^"]*)"$/, async function (who) {
  const address = h.addressOf(this, who);
  // The app sends its mail before it answers the form; a mail on its way is in the catcher within a moment.
  const deadline = Date.now() + 3000;
  for (;;) {
    const came = (await h.mailTo(this, address)).filter((m) => Date.parse(m.Created) >= mailSince(this));
    if (came.length) throw friendly({ message: `A mail came to ${address}: ${h.listed(came.map((m) => m.Subject))}.`, hint: 'Look at the mail catcher: the app sent a mail where none was expected.' });
    if (Date.now() > deadline) return;
    await this.page.waitForTimeout(250);
  }
});

/**
 * The mail with a subject to an account or an address says a text (in its plain text or its HTML).
 *
 * Example #1: Then the email with the subject "Reset your password" to "user" should contain "If you didn't request a password reset, you can ignore this email."
 * Example #2: Then the email with the subject "Confirm your email" to "unconfirmeduser" should contain "Please confirm your account by clicking here"
 * Example #3: Then the email with the subject "Reset your password" to "user@example.com" should contain "clicking here"
 * Example #4: And the email with the subject "Confirm your email" to "user" should contain "confirm your account"
 * Example #5: Then the email with the subject "Reset your password" to "user" should contain "Please reset your password"
 */
Then(/^the email with the subject "([^"]*)" to "([^"]*)" should contain "([^"]*)"$/, async function (subject, who, expected) {
  const address = h.addressOf(this, who);
  const found = await waitForMail(this, address, subject);
  const message = await h.mailMessage(this, found.ID);
  const text = h.mailText(message);
  if (!mentions(text, expected)) throw friendly({ message: `The mail "${message.Subject}" to ${address} does not say "${expected}". It says: "${text.slice(0, 300)}".`, hint: 'The words of the mail are the app\'s email sender\'s.' });
});

/**
 * Open a link of the newest mail to an account or an address since the scenario began, by the words of the link
 * ("clicking here"), in the browser.
 *
 * Example #1: When I open the "clicking here" link of the email to "user"
 * Example #2: When we open the "clicking here" link of the email to "user@example.com"
 * Example #3: And I open the "clicking here" link of the email to "user-changed@example.com"
 * Example #4: When I open the "clicking here" link of the email to "unconfirmeduser"
 * Example #5: When I open the "here" link of the email to "user"
 */
When(/^(?:I|we) open the "([^"]*)" link of the email to "([^"]*)"$/, async function (words, who) {
  const address = h.addressOf(this, who);
  const all = await h.eventually(this, async () => (await h.mailTo(this, address)).filter((m) => Date.parse(m.Created) >= mailSince(this)), (list) => list.length > 0, () => ({
    message: `No mail came to ${address} in this scenario.`,
    hint: 'A step that makes the app send a mail comes first ("When I ask for a password reset link for "…"").',
  }), h.budget(this));
  let link = null;
  let links = [];
  for (const m of all) {
    links = h.mailLinks(await h.mailMessage(this, m.ID));
    link = links.find((l) => h.clean(l.text).toLowerCase() === h.clean(words).toLowerCase()) || links.find((l) => mentions(l.text, words));
    if (link) break;
  }
  if (!link) throw friendly({ message: `No mail to ${address} has a link "${words}". The newest has ${h.listed(links.map((l) => l.text))}.`, hint: 'Name the link by its words in the mail.' });
  await h.open(this, link.href);
  // The confirmation of a new address changes the address the account logs in with.
  await h.noteConfirmedEmailChange(this);
});

module.exports = { waitForMail, mailSince };
