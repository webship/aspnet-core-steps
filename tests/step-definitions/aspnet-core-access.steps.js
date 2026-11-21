'use strict';

// Who may open what, and the anti-forgery token: a page open or refused to the session of the browser (a visitor is
// sent to the login page, a signed-in account without the role or the policy the page asks for to the Access denied
// page), the token every form that posts carries (`__RequestVerificationToken`), and the refusal of a form sent with
// a forged token or from a page of another site.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');

/**
 * Assert that the session of the browser may, or may not, open a page of the app. A refused visitor is sent to the
 * login page; a refused account is sent to the Access denied page (the app answers a refusal with a redirect, so the
 * browser never sees a 403 there) or gets a 401 or 403 answer.
 *
 * Example #1: Then I should not be allowed to open "/Admin"
 * Example #2: Then I should be allowed to open "/Admin"
 * Example #3: And we should not be allowed to open "/Movies"
 * Example #4: Then I should be allowed to open "/Movies/Create"
 * Example #5: But I should not be allowed to open "/Identity/Account/Manage"
 */
Then(/^(I |we )*should( not)* be allowed to open "([^"]*)"$/, async function (pronounCase, notCase, path) {
  await h.open(this, h.siteUrl(this, path));
  const status = await h.documentStatus(this);
  const refusedTo = (await h.onLoginPage(this)) ? 'the login page' : h.isOnAccountPage(this, 'AccessDenied') ? 'the Access denied page' : (status === 401 || status === 403) ? `HTTP ${status}` : '';
  if (notCase && !refusedTo) {
    throw friendly({ message: `Expected ${path} to be refused to this session, but it opened: ${await h.describePage(this)}.`, hint: 'A page that needs a session, a role or a policy carries [Authorize] (or a convention of the app); check the rules of the page and who is logged in.' });
  }
  if (!notCase && refusedTo) {
    throw friendly({ message: `Expected ${path} to open for this session, but it was refused: the browser shows ${refusedTo} (${await h.describePage(this)}).`, hint: 'Log in as an account the page lets in (I am a logged in user with the "..." user).' });
  }
});

/** The visible forms of the page that post, with the words of their buttons and whether they carry a token. */
async function postingForms(world) {
  const field = h.antiforgeryField(world);
  return world.page.evaluate((name) => [...document.querySelectorAll('form')].filter((f) => (f.getAttribute('method') || 'get').toLowerCase() === 'post').map((f) => ({
    action: f.getAttribute('action') || '(this page)',
    buttons: [...f.querySelectorAll('button, input[type="submit"]')].map((b) => (b.value && b.tagName === 'INPUT' ? b.value : b.textContent).replace(/\s+/g, ' ').trim()).filter(Boolean),
    token: !!f.querySelector(`input[type="hidden"][name="${name}"]`) && !!(f.querySelector(`input[type="hidden"][name="${name}"]`).value || '').trim(),
  })), field).catch(() => []);
}

/**
 * Assert that every form of the page that posts carries its anti-forgery token (a hidden `__RequestVerificationToken`
 * field with a value), the token the app checks on every post.
 *
 * Example #1: Then every form that posts on this page should carry an anti-forgery token
 * Example #2: Then every form that posts on this page should carry a CSRF token
 * Example #3: And every form that posts on this page should carry an anti-forgery token
 * Example #4: Then every form that posts on this page should carry a CSRF token
 * Example #5: And every form that posts on this page should carry an anti-forgery token
 */
Then(/^every form that posts on this page should carry (?:an anti-forgery|a CSRF) token$/, async function () {
  await h.settle(this);
  const forms = await postingForms(this);
  if (!forms.length) {
    throw friendly({ message: `No form of this page posts (${await h.describePage(this)}).`, hint: 'Open a page with a form that posts: the login page, a Manage page, a page that saves.' });
  }
  const without = forms.filter((f) => !f.token);
  if (without.length) {
    throw friendly({ message: `${without.length} form(s) of this page post without an anti-forgery token: ${without.map((f) => `${f.action} (${h.listed(f.buttons)})`).join('; ')}.`, hint: `A form of the app gets the token from the form tag helper (method="post") or <AntiforgeryToken />; a form written by hand needs @Html.AntiForgeryToken(). The field is ${h.antiforgeryField(this)}.` });
  }
});

/**
 * Assert that the form of a button (found by its words) carries its anti-forgery token.
 *
 * Example #1: Then the form of the "Log in" button should carry an anti-forgery token
 * Example #2: Then the form of the "Save" button should carry a CSRF token
 * Example #3: And the form of the "Logout" button should carry an anti-forgery token
 * Example #4: Then the form of the "Register" button should carry an anti-forgery token
 * Example #5: And the form of the "Change email" button should carry a CSRF token
 */
Then(/^the form of the "([^"]*)" button should carry (?:an anti-forgery|a CSRF) token$/, async function (words) {
  const button = await h.buttonNamed(this, words);
  const name = h.antiforgeryField(this);
  const carries = await button.evaluate((el, field) => {
    const form = el.form || el.closest('form');
    const input = form && form.querySelector(`input[type="hidden"][name="${field}"]`);
    return form ? !!(input && input.value) : null;
  }, name);
  if (carries === null) throw friendly({ message: `The button "${words}" is in no form.`, hint: 'Name a button that sends a form.' });
  if (!carries) throw friendly({ message: `The form of the "${words}" button carries no anti-forgery token (${name}).`, hint: 'A form written by hand needs @Html.AntiForgeryToken() (or <AntiforgeryToken /> in a component).' });
});

/**
 * Press a button of a form after replacing its anti-forgery token with a forged one, as a forged request carries,
 * and wait for the page the app answers with: it refuses it (400 Bad Request) and changes nothing.
 *
 * Example #1: When I press "Save" with a forged token
 * Example #2: When we press "Log in" with a forged token
 * Example #3: And I press "Update password" with a forged token
 * Example #4: When I press "Delete" with a forged token
 * Example #5: When I press "Logout" with a forged token
 */
When(/^(I |we )*press "([^"]*)" with a forged token$/, async function (pronounCase, words) {
  const button = await h.buttonNamed(this, words);
  const name = h.antiforgeryField(this);
  const forged = await button.evaluate((el, field) => {
    const form = el.form || el.closest('form');
    if (!form) return null;
    let input = form.querySelector(`input[type="hidden"][name="${field}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = field;
      form.appendChild(input);
    }
    input.value = 'CfDJ8' + 'forged'.repeat(20);
    // The page's own checks of the fields are no part of a forgery: the next submit event is stopped before they see it.
    form.noValidate = true;
    window.addEventListener('submit', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
    return true;
  }, name);
  if (!forged) throw friendly({ message: `The button "${words}" is in no form.`, hint: 'Name a button that sends a form.' });
  h.forgetSession(this);
  await h.pressAndWait(this, button, { label: `Sending the form of "${words}" with a forged token` });
});

/** Send a form with field values to a URL from a page of another site, and note what the app answered. */
async function sendFromAnotherSite(world, path, fields) {
  const target = h.siteUrl(world, path);
  const page = await world.page.context().newPage();
  const answers = [];
  page.on('response', (response) => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) answers.push(`${response.request().method()} ${response.status()} ${new URL(response.url()).pathname}`);
  });
  try {
    await page.goto('about:blank');
    await page.setContent('<form id="other-site" method="post"></form>');
    await page.evaluate(({ action, values }) => {
      const form = document.getElementById('other-site');
      form.action = action;
      for (const [name, value] of values) {
        const input = document.createElement('input');
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
    }, { action: target, values: fields });
    let failed = null;
    await Promise.all([
      // The browser shows an error page of its own for some refusals (a 400 it gets for the post): the answer counts.
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: h.budget(world) }).catch((err) => { failed = err; }),
      page.evaluate(() => document.getElementById('other-site').submit()),
    ]);
    if (failed && !answers.length) throw failed;
    world.__crossSiteAnswer = { url: page.url(), answers };
  } catch (err) {
    throw friendly({ message: `The form of the other site did not reach ${target}.`, cause: err, hint: 'Check launchUrl in cucumber.js, and that the app is running.' });
  } finally {
    await page.close().catch(() => {});
  }
  h.forgetSession(world);
}

/**
 * Send a form to a path of the app from a page of another site, with the browser's cookies as the browser sends them
 * (a forged cross-site request): an empty form, with no token of the app. The app must refuse it; assert it with
 * "the form of the other site should be refused" and what it changed with the steps after. The page of the other
 * site is closed afterwards and the scenario goes on in its own page.
 *
 * Example #1: When a page of another site sends a form to "/Identity/Account/Logout"
 * Example #2: When a page of another site sends a form to "/Identity/Account/Manage"
 * Example #3: And a page of another site sends a form to "/Movies/Delete/1"
 * Example #4: When a page of another site sends a form to "/Identity/Account/Manage/ChangePassword"
 * Example #5: When a page of another site sends a form to "/Identity/Account/Manage/Disable2fa"
 */
When(/^a page of another site sends a form to "([^"]*)"$/, async function (path) {
  await sendFromAnotherSite(this, path, []);
});

/**
 * Send a form to a path of the app from a page of another site, with the field values of a table (name | value) and
 * no token of the app, as a forged cross-site request carries them.
 *
 * Example #1: When a page of another site sends a form to "/Movies/Edit/2" with:
 * Example #2: When a page of another site sends a form to "/Identity/Account/Manage" with:
 * Example #3: And a page of another site sends a form to "/Movies/Create" with:
 * Example #4: When a page of another site sends a form to "/Identity/Account/Manage/Email?handler=ChangeEmail" with:
 * Example #5: When a page of another site sends a form to "/Movies/Delete/1" with:
 */
When(/^a page of another site sends a form to "([^"]*)" with:$/, async function (path, table) {
  await sendFromAnotherSite(this, path, table.raw());
});

/**
 * Assert that the app refused the form a page of another site sent: it answered with a refusal (400) or sent the
 * browser to the login page (the sign-in cookie is not sent with a form of another site), and nothing it guards was
 * done.
 *
 * Example #1: Then the form of the other site should be refused
 * Example #2: And the form of the other site should be refused
 * Example #3: Then the form of the other site should be refused
 * Example #4: But the form of the other site should be refused
 * Example #5: Then the form of the other site should be refused
 */
Then(/^the form of the other site should be refused$/, async function () {
  const seen = this.__crossSiteAnswer;
  if (!seen) throw friendly({ message: 'No page of another site sent a form in this scenario.', hint: 'Send one first (a page of another site sends a form to "...").' });
  const first = seen.answers[0] || '';
  const login = h.accountPage(this, 'Login').toLowerCase();
  const refused = / 400 /.test(first) || / 40[13] /.test(first) || (/ 30\d /.test(first) && seen.answers.some((a) => a.toLowerCase().includes(login))) || new URL(seen.url).pathname.toLowerCase() === login;
  if (!refused) {
    throw friendly({ message: `The app took the form of the other site: ${h.listed(seen.answers)}.`, hint: 'Every form that posts must be checked for its anti-forgery token (Razor Pages and components check it; an MVC action needs [ValidateAntiForgeryToken] or the AutoValidateAntiforgeryToken filter).' });
  }
});
