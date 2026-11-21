'use strict';

// The error pages: the app's error page for an exception (the exception handler's page, "An error occurred while
// processing your request.", 500), its status code pages for an answer without a body of its own (a 404, a 400 for
// a refused anti-forgery token), no debug information on a live app (no exception, no stack trace, not the developer
// exception page), the developer exception page of a development run, and the request ID an error page gives for the
// logs.

const { Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');

// What a page shows when it carries debug information: the developer exception page and its parts, an exception's
// type, a stack frame, a source file with its line.
const DEBUG_SIGNS = [
  [/An unhandled exception occurred while processing the request\./i, 'the developer exception page'],
  [/\b[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*Exception\b(?!\s+handler)/, 'the name of an exception'],
  [/^\s*at [\w.<>`$]+\(.*\)/m, 'a stack frame'],
  [/\b\w+\.(?:cs|cshtml|razor)(?:, line |:line )\d+/i, 'a source file and its line'],
  [/\bStack\s+Query\s+Cookies\s+Headers\b/, 'the tabs of the developer exception page'],
];

/** The signs of debug information the page on screen shows: [what, the words]. */
async function debugSigns(world) {
  const text = await world.page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
  const found = [];
  for (const [pattern, what] of DEBUG_SIGNS) {
    const match = text.match(pattern);
    if (match) found.push([what, h.clean(match[0]).slice(0, 120)]);
  }
  return found;
}

/**
 * Assert that the browser shows the error page of a status: the status the app answered with, and a page that is an
 * error page (the exception handler's page for 500, "An error occurred while processing your request."; the status
 * code page of the app for the others, which names the status or says the page was not found).
 *
 * Example #1: Then I should see the 404 error page
 * Example #2: Then I should see the 500 error page
 * Example #3: And we should see the 400 error page
 * Example #4: Then I should see the 404 error page
 * Example #5: And I should see the 500 error page
 */
Then(/^(I |we )*should see the (\d{3}) error page$/, async function (pronounCase, code) {
  await h.settle(this);
  const summary = await h.pageSummary(this);
  if (summary.status !== Number(code)) {
    throw friendly({ message: `Expected the ${code} error page, but the browser shows ${await h.describePage(this)}.`, hint: 'The step reads the status the app answered the page on screen with.' });
  }
  const words = `${summary.title} ${summary.heading} ${summary.text.slice(0, 600)}`;
  const reason = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error' }[code] || '';
  const isErrorPage = new RegExp(`\\b${code}\\b|${reason}|\\berror\\b|not found|does not exist`, 'i').test(words);
  if (!isErrorPage) {
    throw friendly({ message: `The page answered ${code}, but it does not read as an error page: "${summary.title || summary.heading}".`, hint: 'An error page names the status, its reason or the error (UseExceptionHandler for exceptions, UseStatusCodePagesWithReExecute for the other statuses).' });
  }
});

/**
 * Assert that the page shows no debug information: not the developer exception page, no exception type, no stack
 * frame, no source file with its line. A live app runs in production, where its error page gives a request ID and
 * nothing of the exception.
 *
 * Example #1: Then the page should not show debug information
 * Example #2: And the page should not show debug information
 * Example #3: Then the page should not show debug information
 * Example #4: But the page should not show debug information
 * Example #5: And the page should not show debug information
 */
Then(/^the page should not show debug information$/, async function () {
  await h.settle(this);
  const signs = await debugSigns(this);
  if (signs.length) {
    throw friendly({ message: `The page shows debug information: ${signs.map(([what, words]) => `${what} ("${words}")`).join('; ')}.`, hint: 'The app runs in the Development environment (ASPNETCORE_ENVIRONMENT=Development) or shows the exception itself; a live app runs in production with an error page of its own (UseExceptionHandler).' });
  }
});

/**
 * Assert that the browser shows the developer exception page, which a development run shows for an exception ("An
 * unhandled exception occurred while processing the request.", the exception, its stack): what a live app must never
 * show.
 *
 * Example #1: Then I should see the developer exception page
 * Example #2: Then we should see the developer exception page
 * Example #3: And I should see the developer exception page
 * Example #4: Then I should see the developer exception page
 * Example #5: And we should see the developer exception page
 */
Then(/^(I |we )*should see the developer exception page$/, async function (pronounCase) {
  await h.settle(this);
  const signs = await debugSigns(this);
  if (!signs.some(([what]) => what === 'the developer exception page')) {
    throw friendly({ message: `Expected the developer exception page, but the browser shows ${await h.describePage(this)}.`, hint: 'The app shows it only in the Development environment (ASPNETCORE_ENVIRONMENT=Development), for an exception it did not handle.' });
  }
});

/**
 * Assert that the error page gives the request ID of the failed request ("Request ID: 00-…"), which the logs of the
 * app carry, so a person can report it.
 *
 * Example #1: Then the error page should show its request ID
 * Example #2: And the error page should show its request ID
 * Example #3: Then the error page should show its request ID
 * Example #4: And the error page should show its request ID
 * Example #5: Then the error page should show its request ID
 */
Then(/^the error page should show its request ID$/, async function () {
  await h.settle(this);
  const text = await this.page.locator('body').innerText().catch(() => '');
  const match = text.match(/Request ID:?\s*(\S+)/i);
  if (!match || match[1].length < 8) {
    throw friendly({ message: `The error page shows no request ID (${await h.describePage(this)}).`, hint: 'The error page of the templates prints "Request ID:" with the trace identifier of the request (Activity.Current?.Id ?? HttpContext.TraceIdentifier).' });
  }
});
