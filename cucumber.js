// A feature file, a scenario (file:line), a folder or a rerun file named on
// the command line of cucumber-js runs alone: `npx cucumber-js
// tests/features/session.feature`. cucumber-js 12 adds the paths of the
// command line to the `paths` of this file instead of using them alone, so
// `paths` is left empty when the command line names any, as in webship-js.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  // Only when cucumber-js itself runs, not when another script reads this file.
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

// The default is the local DDEV site that .github/scripts/build-ddev-site.sh builds (project "aspnetcoresteps"),
// never a site of somebody else: the suite logs in with the accounts below and puts back what a scenario changes.
// LAUNCH_URL points it at another app.
const launchUrl = (process.env.LAUNCH_URL || 'https://aspnetcoresteps.ddev.site').replace(/\/+$/, '');

// The password the build gives every account below; <HANDLE>_PASSWORD changes one.
const password = (handle) => process.env[`${handle.toUpperCase()}_PASSWORD`] || process.env.ACCOUNT_PASSWORD || 'dD.123123ddd';
// The email address an account signs in with; <HANDLE>_EMAIL changes one.
const email = (handle) => process.env[`${handle.toUpperCase()}_EMAIL`] || `${handle}@example.com`;

module.exports = {
  default: {
    // The step timeout is webship-js's (45 s, set when it loads): WEBSHIP_STEP_TIMEOUT=<milliseconds> changes it; a `timeout` key here is ignored.
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions (auto HTML report on exit; disable: WEBSHIP_REPORT_DISABLE=1).
      'tests/step-definitions/**/*.js',                                  // The step definitions of this pack.
    ],
    // FEATURES=tests/features/a.feature,tests/features/b.feature runs a subset too.
    paths: process.env.FEATURES ? process.env.FEATURES.split(',') : (commandLinePaths().length ? [] : ['tests/features/**/*.feature']),
    // CUCUMBER_TAGS=@two-factor runs a lane. The default leaves out work in progress and the assertions that
    // must fail (tests/check-must-fail.js runs them).
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: [
      '@cucumber/pretty-formatter',
      // REPORT_NAME=must-fail keeps the report of another run (tests/check-must-fail.js) apart.
      `json:tests/reports/${process.env.REPORT_NAME || 'cucumber_report'}.json`,
    ],
    formatOptions: {
      // Colours follow the terminal (GitHub Actions counts as one); FORCE_COLOR=1
      // or FORCE_COLOR=0 sets them. cucumber-js 12 deprecated `colorsEnabled`.
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      launchUrl,
      // Where the account pages are: /Identity/Account for the default account pages of a Razor Pages or MVC app
      // (the Login, Logout, Register, ForgotPassword, Manage, ... pages under it), /Account for the account pages of
      // a Blazor Web App. A page only a signed-in account may open: the steps ask it whether the browser is signed in.
      accountPath: process.env.ACCOUNT_PATH || '/Identity/Account',
      protectedPath: process.env.PROTECTED_PATH || '/Movies',
      // The mail catcher the app sends its mail to (Mailpit): the confirmation mail, the password reset.
      mailUrl: process.env.MAIL_URL || `${launchUrl}:8026`,
      // The cookie of the session (the app's sign-in cookie).
      sessionCookie: process.env.SESSION_COOKIE || '.AspNetCore.Identity.Application',
      // An account that logged in once keeps its session for the rest of the run: later scenarios take it over
      // instead of filling in the login form again.
      reuseSessions: process.env.REUSE_SESSIONS !== 'false',
      // Video of the browser: 'off', 'on', 'on-failure' or 'tag' (scenarios tagged @video; @no-video opts out).
      video: { mode: process.env.WEBSHIP_VIDEO || 'off', dir: './videos', size: { width: 1280, height: 720 }, filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}' },
      // JavaScript errors the page raises: 'warn' reports them, 'fail' fails the scenario, 'off' ignores them;
      // @js-fail, @js-warn and @js-off per scenario. The scenarios of an error page or a refusal (a 404, a 400, a 500
      // the app answers) carry @js-off: the browser logs "Failed to load resource" for each of them.
      javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], beforeScenario: false, afterScenario: true },
      // The accounts that "I am a logged in user with the ... user" uses, by handle. They are configuration, not test
      // data: the build of the site makes them once (.github/scripts/build-ddev-site.sh, or the Webship Workspace's
      // builder) and a feature never creates or deletes an account. Each signs in with its email address; otpSecret
      // is the key of an account's authenticator app (base32), which the steps work its codes out from.
      users: {
        // The Administrator role: opens the administration page.
        administrator: { email: email('administrator'), password: password('administrator') },
        // No role.
        user: { email: email('user'), password: password('user') },
        // Two-factor sign-in with an authenticator app.
        twofactoruser: { email: email('twofactoruser'), password: password('twofactoruser'), otpSecret: process.env.TWOFACTORUSER_OTP_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
        // Locked out.
        lockeduser: { email: email('lockeduser'), password: password('lockeduser') },
        // Its email address not confirmed yet.
        unconfirmeduser: { email: email('unconfirmeduser'), password: password('unconfirmeduser') },
      },
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },
      screenshot: {
        dir: './screenshots',
        purge: false,
        onFailed: true,
        onEveryStep: false,
        alwaysFullscreen: false,
        failedPrefix: 'failed_',
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',
      },
    },
  },
};
