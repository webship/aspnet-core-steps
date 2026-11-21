'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the plumbing the steps use and that a
// project can require for its own steps: the wait budget and the settle on the page's own requests, the account pages
// and their paths, the users registry and the session cache, the login form, a press that cannot be lost to a moving
// button, fields found by their label and the errors a form prints for them, the status messages of a page, the status
// of the page on screen, the mail catcher and the codes of an authenticator app.
//
// What the framework draws is the same in every app with individual accounts: the account pages (Login, Logout,
// Register, ForgotPassword, ResetPassword, ResendEmailConfirmation, ConfirmEmail, Lockout, AccessDenied,
// LoginWith2fa, and the Manage pages) under one path, `/Identity/Account` for the default pages of a Razor Pages or
// MVC app, `/Account` for the account pages of a Blazor Web App (`worldParameters.accountPath`); a form posts with an
// anti-forgery token (`__RequestVerificationToken`); a refused field gets its message next to it
// (`span[data-valmsg-for]` turning `.field-validation-error`, or `.validation-message` in a Blazor form), a refused
// form a summary (`.validation-summary-errors`, `ul.validation-errors`); a Manage page says what it did in a status
// message (`div.alert[role=alert]`). Everything is found the way a person finds it first (labels, roles, words), with
// those names and classes as the fallback.
//
// The pages are rendered on the server: an action is a form post and a full page load. A step that acts waits for the
// page it leads to (the navigation, then the page loaded and quiet), an assertion waits on the page (the assertion is
// the wait), and no step sleeps.
//
// Everything builds on webship-js's own helpers (`gotoUrl`, `friendly`) so the steps fail the way the core webship-js
// steps do.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { request: playwrightRequest } = require('playwright');
const { gotoUrl, friendly } = require('webship-js/tests/step-definitions/webship');

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 10000);
}

/** The settle budget after an action (`minWaitTime.page`, 3 seconds by default). */
function settleBudget(world) {
  return (world && world.minWaitTime && world.minWaitTime.page) || 3000;
}

/** Escape a literal string for use in a RegExp. */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** White space collapsed and trimmed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  return items.length ? items.map((item) => `"${item}"`).join(', ') : '(none)';
}

/** The site root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** Join the site root and a path with exactly one slash. Absolute URLs pass through. */
function siteUrl(world, url) {
  if (!url) return siteRoot(world) + '/';
  if (/^https?:\/\//i.test(url)) return url;
  return siteRoot(world) + '/' + String(url).replace(/^\/+/, '');
}

/** A setting of cucumber.js (`worldParameters.<key>`), or its default. */
function setting(world, key, fallback) {
  const value = world.parameters && world.parameters[key];
  return value === undefined || value === null || value === '' ? fallback : value;
}

/** A path of the app read from cucumber.js (`worldParameters.<key>`), or its default. */
function appPath(world, key, fallback) {
  return '/' + String(setting(world, key, fallback)).replace(/^\/+/, '');
}

/** The path of the page the browser shows, without the query and the fragment. */
function currentPath(world) {
  try {
    return new URL(world.page.url()).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/** Whether the browser shows the page of a path (trailing slashes and letter case ignored: the app's paths ignore it too). */
function isOnPath(world, path) {
  return currentPath(world).toLowerCase() === (String(path).replace(/\/+$/, '') || '/').toLowerCase();
}

/** Whether the browser shows a page of the site of cucumber.js (its origin). */
function isOnSite(world) {
  try {
    return new URL(world.page.url()).origin === new URL(siteRoot(world)).origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Waiting on the page's own requests
// ---------------------------------------------------------------------------

const TRACKED = new WeakMap();

/** The background requests (XHR and fetch) of the page that are still running. Attached once per page. */
function requests(world) {
  const page = world.page;
  let state = TRACKED.get(page);
  if (!state) {
    state = { pending: new Set() };
    TRACKED.set(page, state);
    const background = (request) => ['xhr', 'fetch'].includes(request.resourceType());
    page.on('request', (request) => { if (background(request)) state.pending.add(request); });
    const done = (request) => { state.pending.delete(request); };
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    // A navigation drops the requests of the page it leaves.
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) state.pending.clear(); });
  }
  return state;
}

/**
 * Wait for the page to go quiet after an action: the document is loaded and no background request has been
 * running for a moment. Returns as soon as that is true, at the latest after `timeout` (the settle budget).
 */
async function settle(world, timeout) {
  const state = requests(world);
  const deadline = Date.now() + (timeout || settleBudget(world));
  await world.page.waitForLoadState('domcontentloaded', { timeout: Math.max(deadline - Date.now(), 1) }).catch(() => {});
  let quietSince = 0;
  while (Date.now() < deadline) {
    if (state.pending.size === 0) {
      if (!quietSince) quietSince = Date.now();
      if (Date.now() - quietSince >= 300) return;
    } else {
      quietSince = 0;
    }
    await world.page.waitForTimeout(40);
  }
}

// A request the browser lost because the network of the machine changed (a container starting or stopping on a
// shared machine): no fault of the scenario or of the app.
const NETWORK_ERRORS = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/;
const CUT_HINT = 'The request was cut before the app answered, because the network of the machine changed (a container starting or stopping); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

/** Whether an error is a request the browser lost to a change of the machine's network. */
function isCut(err) {
  return NETWORK_ERRORS.test(String((err && err.message) || err || ''));
}

/** Open a URL and wait for the page to settle. */
async function open(world, url) {
  requests(world);
  try {
    await gotoUrl(world.page, url);
  } catch (err) {
    if (isCut(err)) throw friendly({ message: `Opening ${url} was cut before the app answered.`, cause: err, hint: CUT_HINT });
    throw err;
  }
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await world.page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await settle(world);
}

/**
 * Run an action that sends the browser to another page (a link, a form), and wait for that page: the navigation
 * it starts, then the page loaded and quiet. Fails with a friendly error when no page comes within the budget.
 */
async function navigating(world, action, { label, hint } = {}) {
  const page = world.page;
  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: budget(world) }),
      action(),
    ]);
  } catch (err) {
    if (isCut(err)) throw friendly({ message: `${label || 'The action'} was cut before the app answered (${page.url()}).`, cause: err, hint: CUT_HINT });
    throw friendly({ message: `${label || 'The action'} did not lead to another page (${page.url()}).`, cause: err, hint });
  }
  await page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await settle(world);
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match and fail with a friendly error
 * otherwise: the wait and the assertion are one call.
 */
async function assertPresence(locator, notCase, { label, hint, timeout, found }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    const seen = found ? await found().catch(() => '') : '';
    throw friendly({
      message: (notCase ? `Expected not to see ${label}, but it is on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`) + (seen ? ` ${seen}` : ''),
      hint,
    });
  }
}

/** Poll a reading until it satisfies a check, or fail with the explanation of the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw friendly(explain(value));
    await world.page.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------
// The account pages
// ---------------------------------------------------------------------------

/** Where the account pages are (`accountPath`: /Identity/Account, or /Account in a Blazor Web App). */
const accountPath = (world) => appPath(world, 'accountPath', '/Identity/Account').replace(/\/+$/, '');
/** An account page by its name: `accountPage(world, 'Login')`, `accountPage(world, 'Manage/Email')`. */
const accountPage = (world, name) => `${accountPath(world)}/${String(name).replace(/^\/+/, '')}`;
/** A page only a signed-in account may open (`protectedPath`, /Movies on the test site). */
const protectedPath = (world) => appPath(world, 'protectedPath', '/Movies');
/** The name of the session cookie (`sessionCookie`: the sign-in cookie, .AspNetCore.Identity.Application). */
const sessionCookieName = (world) => setting(world, 'sessionCookie', '.AspNetCore.Identity.Application');
/** The start of the name of the anti-forgery cookie (`antiforgeryCookie`, .AspNetCore.Antiforgery.). */
const antiforgeryCookiePrefix = (world) => setting(world, 'antiforgeryCookie', '.AspNetCore.Antiforgery.');
/** The name of the cookie that remembers a browser for two-factor sign-in (`twoFactorRememberCookie`). */
const twoFactorRememberCookieName = (world) => setting(world, 'twoFactorRememberCookie', 'Identity.TwoFactorRememberMe');
/** The name of the field of a form that carries its anti-forgery token (`antiforgeryField`). */
const antiforgeryField = (world) => setting(world, 'antiforgeryField', '__RequestVerificationToken');

/** Whether the browser shows an account page (its name as in `accountPage`). Paths are read without letter case. */
function isOnAccountPage(world, name) {
  return isOnPath(world, accountPage(world, name));
}

// ---------------------------------------------------------------------------
// Accounts and sessions
// ---------------------------------------------------------------------------

/**
 * An account of the users registry in cucumber.js (`worldParameters.users`), by the handle a scenario names it with:
 * its `email` (what the login form takes; `username` when the app signs in with another name), its `password`, its
 * `otpSecret` (the key of its authenticator app, base32) and `name`, the name the app shows for it when that is not
 * its email. A password or a key this scenario gave the account wins over the registry's.
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { email: '${handle}@example.com', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is made once by the build of the app, never by a feature.`,
    });
  }
  const login = entry.username || entry.email;
  if (!login || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${login ? 'password' : 'email'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.email and .password in cucumber.js, from environment variables.`,
    });
  }
  const changed = (world.__changed && world.__changed[handle]) || {};
  return {
    handle,
    login: changed.login || login,
    email: changed.email || entry.email || login,
    password: changed.password || entry.password,
    registryPassword: entry.password,
    otpSecret: changed.otpSecret || entry.otpSecret || '',
    name: entry.name,
  };
}

/** The handle of the registry an address or a handle stands for, or ''. */
function handleOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  if (users[who]) return who;
  const wanted = String(who).toLowerCase();
  for (const [handle, entry] of Object.entries(users)) {
    if ([entry.email, entry.username].filter(Boolean).some((v) => String(v).toLowerCase() === wanted)) return handle;
  }
  return '';
}

/** The email address of a handle of the registry; anything else is an address already. */
function addressOf(world, who) {
  const handle = handleOf(world, who);
  if (!handle) return String(who);
  const account = resolveUser(world, handle);
  return account.email;
}

/** Note what a scenario changed of an account (its password, its email, its authenticator key) for the steps after. */
function accountChanged(world, handle, change) {
  world.__changed = world.__changed || {};
  world.__changed[handle] = { ...(world.__changed[handle] || {}), ...change };
}

// The sessions of the accounts that logged in during this run, by site and login: the cookies of the browser after
// a login through the form. A scenario that logs in as an account that already has a session takes it over instead
// of filling in the login form again. `worldParameters.reuseSessions: false` in cucumber.js turns it off.
const SESSIONS = new Map();

function sessionKey(world, login) {
  return `${siteRoot(world)}|${String(login).toLowerCase()}`;
}

function reuseSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** Forget the session the browser holds in the cache of this run (a logout, an expiry, a change of the account). */
function forgetSession(world) {
  if (world.__sessionKey) SESSIONS.delete(world.__sessionKey);
  world.__sessionKey = null;
}

/** Forget every session of an account in the cache of this run (its password or its sign-in changed). */
function forgetSessionsOf(world, login) {
  SESSIONS.delete(sessionKey(world, login));
}

/** A cookie of the browser for the site, by name (or by the start of its name), or null. */
async function cookieNamed(world, name, { prefix = false } = {}) {
  const cookies = await world.page.context().cookies(siteRoot(world) || undefined).catch(() => []);
  return cookies.find((cookie) => (prefix ? cookie.name.startsWith(name) : cookie.name === name)) || null;
}

/**
 * Note a change of email the app confirmed: a scenario asked for it (`world.__emailChange`) and the page of the
 * confirmation link says so. The account logs in with its new address from then on (or with the registry's again).
 */
async function noteConfirmedEmailChange(world) {
  const pending = world.__emailChange;
  if (!pending || !isOnAccountPage(world, 'ConfirmEmailChange')) return;
  const text = clean(await world.page.locator('main').innerText().catch(() => ''));
  if (!/confirming your email change/i.test(text)) return;
  const entry = world.parameters.users[pending.handle] || {};
  const back = (entry.email || '').toLowerCase() === pending.to.toLowerCase();
  forgetSessionsOf(world, resolveUser(world, pending.handle).login);
  accountChanged(world, pending.handle, back ? { email: null, login: null } : { email: pending.to, login: pending.to });
  world.__emailChange = null;
}

// ---------------------------------------------------------------------------
// Forms: the login form, a press that is not lost
// ---------------------------------------------------------------------------

/** The login form: a form of the page that holds a password field. */
function loginForm(world) {
  return world.page.locator('form:has(input[type="password"])').first();
}

/** Whether the browser shows the login page with its form. */
async function onLoginPage(world) {
  if (!isOnAccountPage(world, 'Login')) return false;
  return (await loginForm(world).count().catch(() => 0)) > 0;
}

/**
 * Press a button that sends its form, as a person does, and wait for the page that answers. The button gets the
 * focus first: the field the cursor leaves is checked by the page's scripts, the error line under it appears or
 * goes, and the button moves; a click made at once would land where the button was. Then the click.
 */
async function pressAndWait(world, button, { label, hint } = {}) {
  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.focus().catch(() => {});
  await settle(world, 1000);
  await navigating(world, () => button.click(), { label, hint });
}

/** A visible button of the page (or of a part of it) by its words: a button, a submit input, a link styled as one. */
async function buttonNamed(world, words, { within } = {}) {
  const scope = within || world.page;
  const candidates = [
    scope.getByRole('button', { name: words, exact: true }),
    scope.locator(`input[type="submit"][value="${String(words).replace(/["\\]/g, '\\$&')}"]`),
    scope.getByRole('button', { name: new RegExp('^\\s*' + escapeRegExp(words), 'i') }),
  ];
  for (const locator of candidates) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      if (await locator.nth(i).isVisible().catch(() => false)) return locator.nth(i);
    }
  }
  const names = await scope.locator('button, input[type="submit"]').evaluateAll((els) => els.filter((el) => el.offsetParent !== null).map((el) => (el.value || el.textContent || '').trim())).catch(() => []);
  throw friendly({ message: `No button "${words}" is on the page (${world.page.url()}). The buttons are: ${listed(names)}.`, hint: 'Name the button by its words as the page writes them.' });
}

// ---------------------------------------------------------------------------
// The page on screen: its status, a summary for an error message
// ---------------------------------------------------------------------------

/** The HTTP status of the page on screen: the one webship-js recorded for its navigation, else the browser's. */
async function documentStatus(world) {
  const last = world._lastResponse;
  const strip = (url) => String(url || '').split('#')[0];
  if (last && last.page === world.page && strip(last.url) === strip(world.page.url())) return last.status;
  return world.page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0];
    return entry && typeof entry.responseStatus === 'number' && entry.responseStatus ? entry.responseStatus : null;
  }).catch(() => null);
}

/** What the page on screen says about itself: its status, title, main heading and text. */
async function pageSummary(world) {
  const status = await documentStatus(world);
  const title = clean(await world.page.title().catch(() => ''));
  const heading = clean(await world.page.locator('h1, h2, h3').filter({ visible: true }).first().innerText({ timeout: 500 }).catch(() => ''));
  const text = clean(await world.page.locator('body').innerText({ timeout: 1000 }).catch(() => ''));
  return { status, title, heading, text };
}

/** A short description of the page on screen for a failure message. */
async function describePage(world) {
  const summary = await pageSummary(world);
  return `HTTP ${summary.status === null ? '(status unknown)' : summary.status} at ${currentPath(world)}, "${summary.title || summary.heading}"`;
}

// ---------------------------------------------------------------------------
// Fields and their errors
// ---------------------------------------------------------------------------

/**
 * The visible form control a person means by `name`: its label exactly as written (a label element, `aria-labelledby`
 * or `aria-label`), then its `name` attribute ("Input.Email"), then the one label that starts with the text (letter
 * case ignored), then its placeholder.
 */
async function findField(world, name, { timeout, within } = {}) {
  const scope = within || world.page;
  const deadline = Date.now() + (timeout || budget(world));
  const candidates = () => [
    scope.getByLabel(name, { exact: true }),
    scope.locator(`[name="${String(name).replace(/["\\]/g, '\\$&')}"]`),
    scope.getByLabel(new RegExp('^\\s*' + escapeRegExp(name), 'i')),
    scope.getByPlaceholder(name, { exact: true }),
  ];
  for (;;) {
    for (const locator of candidates()) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible().catch(() => false)) return item;
      }
    }
    if (Date.now() > deadline) break;
    await world.page.waitForTimeout(150);
  }
  const labels = await visibleFieldLabels(world);
  throw friendly({
    message: `No field "${name}" is on the page (${world.page.url()}). The fields are: ${listed(labels)}.`,
    hint: 'Name the field by its label as the page writes it, or by its name attribute ("Input.Email").',
  });
}

/** The labels of the visible form controls of the page, for an error message. */
async function visibleFieldLabels(world) {
  return world.page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
      const text = by.length ? by.map((n) => n.textContent).join(' ') : ((el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
      out.push(text.replace(/\s+/g, ' ').trim());
    }
    return out;
  }).catch(() => []);
}

// What a server-rendered form prints next to a field it refused: the message of a validation tag
// (`span[data-valmsg-for="<name>"]`, class `field-validation-error` once it holds one), of a validation component
// (`.validation-message`), or of a theme (`.invalid-feedback`, `.help-block`), or an element the field's
// `aria-describedby` names.
const ERROR_LINES = '.field-validation-error, .validation-message, .invalid-feedback, .help-block, .help-inline, .error-message, [id$="-error"]';

/**
 * The error messages the page shows for a field: the validation message named after the field
 * (`[data-valmsg-for="<name>"]`), the elements its `aria-describedby` names, then the error lines inside the smallest
 * container that holds the field and no other field.
 */
async function fieldErrors(field) {
  return field.evaluate((el, selector) => {
    const shown = (n) => {
      if (!n || !n.isConnected) return false;
      const style = getComputedStyle(n);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const box = n.getBoundingClientRect();
      return box.width > 0 || box.height > 0;
    };
    const text = (n) => (n.textContent || '').replace(/\s+/g, ' ').trim();
    const found = [];
    const name = el.getAttribute('name');
    if (name) {
      for (const node of document.querySelectorAll('[data-valmsg-for]')) {
        if (node.getAttribute('data-valmsg-for') === name && shown(node) && text(node)) found.push(text(node));
      }
    }
    for (const id of (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
      const node = document.getElementById(id);
      if (node && shown(node) && text(node) && node.matches(selector)) found.push(text(node));
    }
    let group = null;
    for (let node = el.parentElement, i = 0; node && i < 6; node = node.parentElement, i += 1) {
      if (node.tagName === 'FORM') break;
      const others = [...node.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((c) => c !== el);
      if (others.length) break;
      group = node;
    }
    if (group) {
      for (const line of group.querySelectorAll(selector)) {
        if (line === el || line.contains(el)) continue;
        if (shown(line) && text(line)) found.push(text(line));
      }
    }
    return [...new Set(found)];
  }, ERROR_LINES).catch(() => []);
}

/** Every refused field of the page with its errors: [{field, errors}] by the field's label (else its name). */
async function refusedFields(world) {
  const page = world.page;
  const fields = page.locator('form input:not([type=hidden]):not([type=submit]):not([type=button]), form select, form textarea');
  const out = [];
  const count = await fields.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (!(await field.isVisible().catch(() => false))) continue;
    const errors = await fieldErrors(field);
    if (!errors.length) continue;
    const label = await field.evaluate((el) => {
      const by = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
      const text = by.length ? by.map((n) => n.textContent).join(' ') : ((el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') || el.getAttribute('name') || '');
      return text.replace(/\s+/g, ' ').trim();
    });
    out.push({ field: label, errors });
  }
  return out;
}

/**
 * The errors a form shows for itself, not for one field: the validation summary (`.validation-summary-errors li`,
 * or the `ul.validation-errors` of a Blazor form) and the error status message of the page ("Error: ...").
 */
async function formErrors(world) {
  return world.page.evaluate(() => {
    const shown = (n) => {
      const style = getComputedStyle(n);
      const box = n.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && (box.width > 0 || box.height > 0);
    };
    const out = [];
    for (const n of document.querySelectorAll('.validation-summary-errors li, ul.validation-errors li, .alert-danger')) {
      if (!shown(n)) continue;
      const copy = n.cloneNode(true);
      copy.querySelectorAll('button').forEach((b) => b.remove());
      const text = copy.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
    return [...new Set(out)];
  }).catch(() => []);
}

// ---------------------------------------------------------------------------
// Messages: the status messages and the alerts of a page
// ---------------------------------------------------------------------------

// The kind of a message by the class the page gives it: Bootstrap's alert-*, and the words other themes use.
const KINDS = [
  ['success', /\b(alert|flash|message|notification|toast)-success\b|\bsuccess\b/],
  ['error', /\b(alert|flash|message|notification|toast)-(danger|error)\b|\b(danger|error)\b/],
  ['warning', /\b(alert|flash|message|notification|toast)-warning\b|\bwarning\b/],
  ['info', /\b(alert|flash|message|notification|toast)-(info|notice|primary|secondary|light|dark)\b|\b(info|notice)\b/],
];

/**
 * The messages the page shows: the status message of a Manage page and the alerts (`.alert`, `[role=alert]`,
 * `[role=status]`), visible, as `{kind, text}`, without the words of their close button. A validation summary is not
 * a message: `formErrors` reads it.
 */
async function pageMessages(world) {
  const list = await world.page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const n of document.querySelectorAll('.alert, [role="alert"], [role="status"]')) {
      if (n.matches('.validation-summary-errors, .validation-summary-valid') || n.querySelector('.validation-summary-errors, ul.validation-errors')) continue;
      if (seen.has(n) || [...seen].some((s) => s.contains(n))) continue;
      const style = getComputedStyle(n);
      const box = n.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || (!box.width && !box.height)) continue;
      const copy = n.cloneNode(true);
      copy.querySelectorAll('button, .btn-close, [data-bs-dismiss], [data-dismiss]').forEach((b) => b.remove());
      const text = (copy.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      seen.add(n);
      out.push({ cls: String(n.className || ''), text });
    }
    return out;
  }).catch(() => []);
  return list.map((item) => {
    const kind = (KINDS.find(([, re]) => re.test(item.cls)) || [''])[0];
    return { kind, text: item.text };
  });
}

// ---------------------------------------------------------------------------
// The mailbox: the mail catcher of the site (Mailpit)
// ---------------------------------------------------------------------------

/** The address of the mail catcher (`worldParameters.mailUrl`), without a trailing slash. */
function mailUrl(world) {
  const url = world.parameters && world.parameters.mailUrl;
  if (!url) throw friendly({ message: 'No mailbox is configured.', hint: 'Set worldParameters.mailUrl in cucumber.js to the mail catcher (Mailpit) the app sends its mail to, for example https://your-project.ddev.site:8026.' });
  return String(url).replace(/\/+$/, '');
}

let MAIL_CONTEXT = null;

/** A request context of its own for the mail catcher, which takes the local certificate of the site. */
async function mailContext() {
  if (!MAIL_CONTEXT) MAIL_CONTEXT = await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
  return MAIL_CONTEXT;
}

/** The messages of the mailbox to an address, newest first, as Mailpit lists them: [{ ID, Subject, Created, To }]. */
async function mailTo(world, address) {
  const ctx = await mailContext();
  let res;
  try {
    res = await ctx.get(`${mailUrl(world)}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=50`, { failOnStatusCode: false });
  } catch (err) {
    throw friendly({ message: `The mail catcher at ${mailUrl(world)} did not answer.`, cause: err, hint: 'Check worldParameters.mailUrl in cucumber.js and that the mail catcher runs (ddev describe lists it).' });
  }
  if (res.status() !== 200) throw friendly({ message: `The mail catcher at ${mailUrl(world)} answered ${res.status()}.`, hint: 'Check worldParameters.mailUrl in cucumber.js and that the mail catcher runs (ddev describe lists it).' });
  const json = await res.json();
  return (json.messages || []).filter((m) => (m.To || []).some((t) => String(t.Address).toLowerCase() === String(address).toLowerCase()));
}

/** One message of the mailbox, whole: { Subject, Text, HTML, To, From }. */
async function mailMessage(world, id) {
  const ctx = await mailContext();
  return (await ctx.get(`${mailUrl(world)}/api/v1/message/${id}`)).json();
}

/** The links of a message: [{ text, href }], from its HTML (the words of the link) or its plain text. */
function mailLinks(message) {
  const links = [];
  for (const m of String(message.HTML || '').matchAll(/<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ text: clean(m[3].replace(/<[^>]+>/g, ' ')), href: m[2].replace(/&amp;/g, '&') });
  }
  if (!links.length) for (const m of String(message.Text || '').matchAll(/https?:\/\/[^\s)]+/g)) links.push({ text: m[0], href: m[0] });
  return links;
}

/** The text of a message, plain and HTML, for a reader. */
function mailText(message) {
  return clean(`${message.Text || ''} ${String(message.HTML || '').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')}`);
}

// ---------------------------------------------------------------------------
// Codes of an authenticator app (RFC 6238: HMAC-SHA1, 6 digits, a new code every 30 seconds)
// ---------------------------------------------------------------------------

/** The bytes of a base32 key (spaces, dashes, padding and letter case allowed: the page shows it in groups of four). */
function base32Bytes(key) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const text = String(key || '').toUpperCase().replace(/[\s=-]+/g, '');
  if (!text || /[^A-Z2-7]/.test(text)) throw new Error(`"${key}" is not a base32 key`);
  let bits = '';
  for (const c of text) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code of a key at a moment (now by default), as an authenticator app shows it. */
function totp(key, { at = Date.now(), digits = 6, period = 30 } = {}) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)));
  const hmac = crypto.createHmac('sha1', base32Bytes(key)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % (10 ** digits)).padStart(digits, '0');
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/**
 * Run an action that makes the browser download a file and keep the file where webship-js's download steps read it
 * (`world._lastDownload`: { path, filename, content }), so `the downloaded file name should be "…"` and `the
 * downloaded file should contain:` work on it.
 */
async function keepDownload(world, action, { label, hint } = {}) {
  let download;
  try {
    [download] = await Promise.all([world.page.waitForEvent('download', { timeout: budget(world) }), action()]);
  } catch (err) {
    throw friendly({ message: `${label || 'The action'} downloaded no file.`, cause: err, hint });
  }
  const dir = path.join(os.tmpdir(), `webship-dl-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const filename = download.suggestedFilename();
  const filePath = path.join(dir, `${Date.now()}-${filename}`);
  await download.saveAs(filePath);
  world._lastDownload = { path: filePath, filename, content: fs.readFileSync(filePath) };
  return world._lastDownload;
}

module.exports = {
  budget,
  settleBudget,
  escapeRegExp,
  clean,
  listed,
  siteRoot,
  siteUrl,
  setting,
  appPath,
  currentPath,
  isOnPath,
  isOnSite,
  requests,
  settle,
  isCut,
  CUT_HINT,
  open,
  navigating,
  assertPresence,
  eventually,
  accountPath,
  accountPage,
  protectedPath,
  sessionCookieName,
  antiforgeryCookiePrefix,
  twoFactorRememberCookieName,
  antiforgeryField,
  isOnAccountPage,
  resolveUser,
  handleOf,
  addressOf,
  accountChanged,
  noteConfirmedEmailChange,
  SESSIONS,
  sessionKey,
  reuseSessions,
  forgetSession,
  forgetSessionsOf,
  cookieNamed,
  loginForm,
  onLoginPage,
  pressAndWait,
  buttonNamed,
  documentStatus,
  pageSummary,
  describePage,
  findField,
  visibleFieldLabels,
  ERROR_LINES,
  fieldErrors,
  refusedFields,
  formErrors,
  pageMessages,
  mailUrl,
  mailContext,
  mailTo,
  mailMessage,
  mailLinks,
  mailText,
  base32Bytes,
  totp,
  keepDownload,
};
