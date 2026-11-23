<p align="center"><img src="https://raw.githubusercontent.com/webship/aspnet-core-steps/2.0.x/assets/logo.svg" alt=".NET logo" width="96"></p>

# aspnet-core-steps

[![Test](https://github.com/webship/aspnet-core-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/aspnet-core-steps/actions/workflows/test.yml)

Cucumber step definitions for the account pages every ASP.NET Core app with individual accounts has, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

An ASP.NET Core app has no fixed pages of its own, but an app made from the official templates with individual
accounts has the same account pages (the default account pages of a Razor Pages or MVC app, or the account pages a
Blazor Web App carries as components), the same anti-forgery protection, error pages and validation messages, and
those are what a tester meets first and what most often breaks when an app grows. `@webship-js/aspnet-core-steps`
covers them:

- **the session**: the login page and its refusal ("Invalid login attempt." for a wrong password, an unknown account
  and an unconfirmed one alike), logging in by a handle of the users registry or taking over an account's session from
  earlier in the run, the page asked for before the login opening after it (its ReturnUrl), logging out through the
  app's button or the logout page, who is signed in, "Remember me?" and a browser closed and opened again, a session
  the app no longer accepts, the flags of the session and anti-forgery cookies;
- **two-factor sign-in**: the page that asks for the code after the password, a code worked out from the account's
  authenticator key the way an authenticator app does, a wrong code, "Remember this machine" and "Forget this
  browser", and on the Manage pages the set-up of an authenticator app (the key the page shows, the recovery codes) and
  turning it off;
- **the mail**: the password reset and the confirmation mail read from the mail catcher, their words and their links,
  and no mail for an unknown or an unconfirmed address;
- **the account pages**: registration through its refusals only (a missing field, a bad address, a weak or
  mismatched password, a taken address), the lockout page, the access denied page, the Manage pages (profile, email,
  password, personal data) with their status messages, a changed password or email and the way back;
- **who may open what**: a page open or refused to the session of the browser (a visitor is sent to the login page,
  an account without the role to the access denied page);
- **the anti-forgery token**: every form that posts carries its token, a form sent with a forged token or from a page
  of another site is refused, and nothing changes;
- **the error pages**: the app's error page for an exception (500, with its request ID), its status code pages (404,
  400), no debug information on a live app, and the developer exception page of a development run;
- **server-rendered forms**: the validation message next to each refused field (the page's own checks before the form
  is sent, the app's after it), the errors of the whole form, a form sent without the page's checks, and the details a
  page lists.

No step phrase names the platform: a scenario reads `When I enter the authenticator code of "twofactoruser"` and
`Then the page should not show debug information`.

CI builds four real apps with [DDEV](https://ddev.com) on the runner (the two templates, on the current .NET release
and on the long-term-support one) and runs their suites twice on every push and pull request, then the assertions
that must fail and a development run; see [The test apps](#the-test-apps) and
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, Python 3, and Node.js 24 or later with npm. The app
is made, built and run in its container, with the .NET SDK of its official image: no .NET on the machine, no public
domain and no account anywhere.

**1. The site.** The pack's own build script (the one CI runs) makes a DDEV project with the Razor Pages app of the
official template with individual accounts (`dotnet new webapp --auth Individual`) at the current .NET release
(11.0), with what an app adds once it goes to work (see [The test apps](#the-test-apps)), published and run in
production. It takes about five minutes the first time (the SDK's image, about 900 MB, and the app's packages, about
250 MB) and two or three after that.

```bash
git clone https://github.com/webship/aspnet-core-steps.git
SITE_DIR="$PWD/aspnet-core-site" aspnet-core-steps/.github/scripts/build-ddev-site.sh
```

The app answers at `https://aspnetcoresteps.ddev.site`, its mail catcher at `https://aspnetcoresteps.ddev.site:8026`.
The accounts are `administrator` (the Administrator role), `user`, `twofactoruser` (two-factor sign-in),
`lockeduser` (locked out) and `unconfirmeduser` (its email not confirmed), each signing in with its address at
`example.com` and the password `dD.123123ddd`.

In the [Webship Workspace](https://github.com/webship/workspace), its ASP.NET Core plugin builds the same site
instead, in a sites folder of the workspace (`dev/` here, the one `--with-needs` adds to a new workspace; `test/`,
`sandboxes/` and `demos/` work the same):

```bash
bash core/scripts/plugins.sh --require aspnet-core --with-needs
bash core/scripts/plugins.sh --activate aspnet-core --with-needs
bash core/scripts/plugins.sh --install aspnet-core
bash dev/cmd-aspnet-core-project.sh aspsite --install --add-users
```

That site answers at `https://aspsite.ddev.site`. Its accounts are the plugin's: the same five, at `example.com`,
with the workspace's shared password `dD.123123ddd` and the same authenticator key. With `--template blazor` the
builder makes the Blazor Web App instead (the app of `tests/blazor/`); the plugin's README says how to manage the app
and its accounts with its tool (`cmd-tools-aspnet-core-cli.sh aspsite --add-users`).

**2. A test project.**

```bash
mkdir aspnet-core-tests && cd aspnet-core-tests
npm init -y
npm install --save-dev webship-js @webship-js/aspnet-core-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first feature and
the `npm test` scripts, and installs Chromium. npm usually runs it already when it installs webship-js; a second run
changes nothing. Its first feature opens the app's home page: it passes, and can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step files of webship-js and of the pack,
the tags that keep the assertions that must fail out of a normal run, where the app's account pages are, the mail
catcher, and the accounts (the JSON of [Test users](#test-users)). The first lines are the starter's own: a feature
named on the command line runs alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
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

const launchUrl = (process.env.LAUNCH_URL || 'https://aspnetcoresteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/aspnet-core-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // Where the account pages are (/Identity/Account for the default account pages, /Account in a Blazor Web App),
      // a page only a signed-in account may open, and the mail catcher the app sends its mail to.
      accountPath: '/Identity/Account',
      protectedPath: '/Movies',
      mailUrl: `${launchUrl}:8026`,
      // Browser messages: the browser logs every error page it gets ("Failed to load resource: the server responded
      // with a status of 404 ()"): the scenarios that open one carry @js-off.
      javascript: { mode: 'warn', levels: ['error'], beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { email: 'administrator@example.com', password: 'dD.123123ddd' },
        user: { email: 'user@example.com', password: 'dD.123123ddd' },
        twofactoruser: { email: 'twofactoruser@example.com', password: 'dD.123123ddd', otpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' },
        lockeduser: { email: 'lockeduser@example.com', password: 'dD.123123ddd' },
        unconfirmeduser: { email: 'unconfirmeduser@example.com', password: 'dD.123123ddd' },
      },
    },
  },
};
```

On the site from the Webship Workspace (step 1) the accounts and the paths are the same; its address goes in
`LAUNCH_URL` (step 5), and the mail catcher follows it.

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: A visitor is sent to the login page, and back to the page after the login
    Given I am not logged in
    When I go to "/Movies"
    Then I should be on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should be logged in as "user"

  Scenario: The app asks the two-factor account for the code of its authenticator app
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    Then I should be asked for the authenticator code
    When I enter the authenticator code of "twofactoruser"
    Then I should be logged in as "twofactoruser"
```

**5. Run it.** Set `LAUNCH_URL` to the address of the app: `https://aspnetcoresteps.ddev.site` for the build
script's site, `https://aspsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://aspnetcoresteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and the starter's, passed) and the HTML
report it wrote:

```
3 scenarios (3 passed)
14 steps (14 passed)
0m14.334s (executing steps: 0m14.297s)
[webship-js] HTML report → …/aspnet-core-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with its line):

```bash
LAUNCH_URL=https://aspnetcoresteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they also ship in the package, under
`node_modules/@webship-js/aspnet-core-steps/tests/features/`). Together with the features of the Blazor Web App
(`tests/blazor/`, run with `ACCOUNT_PATH=/Account PROTECTED_PATH=/auth` in the pack's own `cucumber.js`) they use
every step of the pack. They run as they are on the site of either way of step 1, and leave its data as they found
it; they read no file of their own. A Blazor Web App needs `accountPath: '/Account'` and `protectedPath: '/auth'`.

For your own app, point `launchUrl` at it, `accountPath` at its account pages, `protectedPath` at a page only a
signed-in account may open, `mailUrl` at the mail catcher its mail goes to, and `users` at its test accounts (`email`
and `password`; `otpSecret` for an account with two-factor sign-in: the base32 key its authenticator app was given;
`name` when the app shows another name for it). The steps read what the account pages draw the same way in every
app; the app's own words (its menus, its pages) are read with webship-js's `I should see "…"`.

### What the suite tests

The features of this repository run every step of the pack against two apps, on two .NET releases, twice in a row
in CI on every change:

- `tests/features/` on the Razor Pages app (48 scenarios): a visitor sent to the login page and back to the page
  asked for; each account logging in; a wrong password, an unknown account and an unconfirmed email refused with the
  same words; the lockout page; the logout button and the logout page; the session cookie's flags, how long it lasts
  with and without "Remember me?", a browser closed and opened again, a session the app no longer accepts; the code of
  the authenticator app after the password, a wrong code, "Remember this machine" and "Forget this browser"; the set-up
  of an authenticator app, a login with its code, the recovery codes, turning it off, a refused set-up; a forgotten
  password reset through the mail, no mail for an unknown or unconfirmed address, the confirmation mail and its link;
  registration refused field by field, for a weak password and for a taken address; the Manage pages, a phone number
  saved and taken away, a refused password change, a password and an email changed and changed back, the personal data
  download; the pages of each role and the access denied page; the token of every form, a forged token in the login
  form and in a save, a form from another site, all refused with nothing changed; the error page of an exception with
  its request ID, the status code pages, no debug information; the record pages of the tutorial (the list and its
  search, the page's checks and the app's, create, details, edit, delete);
- `tests/blazor/` on the Blazor Web App (19 scenarios): the same session, two-factor, mail, account, access and
  error steps on the account pages a Blazor Web App carries as components, with a form from another site refused;
- `tests/development/` on the Razor Pages app run in the Development environment (1 scenario): the developer
  exception page, which the step of a live app catches;
- `tests/must-fail/` (40 scenarios, and 1 in `tests/development/`): an assertion that is not true for each step, which
  must fail with its message and a hint.

Not tested: external logins (none is configured, and none can be without an account at a provider), passkeys (the
Blazor Web App has them; a browser test needs a virtual authenticator), logging in with a recovery code (a code works
once), deleting the personal data (it deletes the account), MVC apps beyond their shared account pages (the steps find
their forms the same way), apps with roles or policies of their own beyond one role page, and languages other than
English (the steps read the words of the account pages: "Invalid login attempt.", "Locked out", "Access denied").

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- An ASP.NET Core app with individual accounts (the default account pages, or the account pages of a Blazor Web
  App; the steps hold on .NET 11 and on the long-term-support .NET 10), its accounts for the suite, and a mail catcher
  for the mail steps

## Install

```bash
npm install --save-dev @webship-js/aspnet-core-steps
```

## The test apps

The suite runs against two apps, each made with `dotnet new` in a DDEV project by
[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) and prepared by
[`site/prepare-app.py`](site/prepare-app.py):

- **The Razor Pages app** (`TEMPLATE=webapp`, the default): `dotnet new webapp --auth Individual`, the official
  template with individual accounts. It was chosen because it is where most apps with accounts start: the default
  account pages of the framework (Login, Register, the Manage pages, two-factor sign-in, the lockout and access denied
  pages) are the ones a Razor Pages or MVC app with individual accounts shows, SQLite as the template has it, and the
  error page of the template. The build adds what an app adds once it goes to work: the Administrator role and a page
  only it opens (`/Admin`, the accounts of the app), an email sender over SMTP pointed at the project's mail catcher in
  place of the template's sender that sends nothing, the keys of its cookies kept in the project, a status code page
  (`UseStatusCodePagesWithReExecute`), a seeding step of its own that makes the accounts through the app's user
  manager, and the movies pages of the official Razor Pages tutorial behind the login (the model and its validation
  attributes, the list with the tutorial's search, create, details, edit, delete, in the markup the official scaffolder
  writes, with the tutorial's sample movies). One page is no page of a real app: `/Throw` throws, for the error page.
- **The Blazor Web App** (`TEMPLATE=blazor`): `dotnet new blazor --auth Individual`, the other official template with
  individual accounts, whose account pages are components of the app (under `/Account`), checked in the browser on the
  current release, and protected against forgery without a token on the current release. The build adds the
  same things but the movies and the status code page (the template has one).

`DOTNET_VERSION=10.0` makes either on the long-term-support release. `APP_ENVIRONMENT=Development` runs the app in
development, for the developer exception page.

## How the steps find things and wait

- **By what a person reads.** A field by the label over it, a button by its words, an account by a handle of the
  users registry, a message by its words, an account page by its name under `accountPath`. What the framework draws
  the same way in every app is the fallback: the fields of the account forms (`Input.Email`, `Input.Password`,
  `Input.TwoFactorCode`), the key of the set-up page (`kbd`, and the `otpauth://` address of its QR code), the hidden
  anti-forgery field (`__RequestVerificationToken`), the message of a refused field (`span[data-valmsg-for]` of a page,
  `.validation-message` of a component, or the element its `aria-describedby` names), the summary of a form
  (`.validation-summary-errors`), and the status message of a page (`.alert[role=alert]`).
- **The app's own signals, no fixed sleeps.** The pages are rendered on the server: an action is a form post and a
  page load (or, in a Blazor Web App, a page the app patches in), so a step that acts waits for the page it leads to
  (the navigation, then the page loaded with no request of its own still running), and an assertion waits on the page
  until it holds or its time is up. A step that sends a form focuses its button before it clicks it: the field the
  cursor leaves is checked by the page, its error line appears or goes, and the button moves.
- **Who is signed in** is asked of the app itself: a step opens a page only a signed-in account may open
  (`protectedPath`) and reads whether the app answers it or sends the browser to the login page, and who its
  navigation names in its link to the Manage pages.
- **A code of an authenticator app** is worked out from the account's key the way the app does it (RFC 6238: HMAC-SHA1,
  six digits, a new code every 30 seconds): the registry's `otpSecret`, or the key the set-up page showed in this
  scenario.
- **The mail** is read from the mail catcher's API (`mailUrl`, a Mailpit): only the mail that came since the scenario
  began.
- **A session the app no longer accepts** is a sign-in cookie it never issued, which is what the app sees from a
  browser whose sign-in ran out or whose keys changed.
- **A closed browser** keeps its persistent cookies (a sign-in kept with "Remember me?", a browser remembered for
  two-factor sign-in) and its local storage, and loses its session cookies: the step opens a new browser context with
  those.
- **The way back.** A step that changes an account (its password, its email, two-factor sign-in) keeps what it changed
  for the steps after it, and a scenario that does not change it back is put back after it, through the same pages.
- **Failures say what was found.** `Expected /Movies to open for this session, but it was refused: the browser shows
  the login page`, `The login page does not say "Bad credentials". It says: "Invalid login attempt."`, with a hint on
  where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list the ones the app has in
`worldParameters.users`, by a handle the scenarios use, each with its `email` and `password`, `otpSecret` for
two-factor sign-in, and `name` when the app shows another name for it. An account that signed in once keeps its
session for the rest of the run (`reuseSessions: false` turns it off); a logout ends it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in `worldParameters.users` (the
default values; the `<HANDLE>_EMAIL`, `<HANDLE>_PASSWORD` and `TWOFACTORUSER_OTP_SECRET` variables replace them).
The build script makes them; the Workspace's ASP.NET Core plugin makes the same five.

```json
{
  "administrator": { "email": "administrator@example.com", "password": "dD.123123ddd" },
  "user": { "email": "user@example.com", "password": "dD.123123ddd" },
  "twofactoruser": { "email": "twofactoruser@example.com", "password": "dD.123123ddd", "otpSecret": "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" },
  "lockeduser": { "email": "lockeduser@example.com", "password": "dD.123123ddd" },
  "unconfirmeduser": { "email": "unconfirmeduser@example.com", "password": "dD.123123ddd" }
}
```

`administrator` has the role Administrator: it opens the administration page. `user` has no role: it opens the
movies and its own Manage pages. `twofactoruser` signs in with a code of its authenticator app, whose key is the
`otpSecret`. `lockeduser` is locked out, and `unconfirmeduser` has not confirmed its email address: the app refuses
both. They are accounts of a throwaway test site, with a placeholder password and a test key, not accounts of any real
one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the site the suite of this
repository runs against:

- a generic DDEV project whose web container runs the published app as a daemon, with the router of DDEV sending the
  project's address to the app's port (5000), no database of DDEV's own (the app keeps its data in SQLite, in `data/`
  of the project, with the keys of its cookies), the mail catcher of DDEV for the app's mail, and Node.js 24 for a
  suite run in the container;
- the .NET SDK at `DOTNET_VERSION` (11.0 by default), copied from its official image into the web image, its
  telemetry off;
- the app made with `dotnet new` (`TEMPLATE`: `webapp` or `blazor`), prepared by [`site/prepare-app.py`](site/prepare-app.py)
  with the files of [`site/app/`](site/app/), the migration of the movies made with the EF Core tools of the app's own
  release, published (Release) and run in production (`APP_ENVIRONMENT`), behind the router's HTTPS, its forwarded
  headers read (`ASPNETCORE_FORWARDEDHEADERS_ENABLED`);
- the accounts of [Test users](#test-users) made by the app's own seeding step through its user manager (the password
  on its standard input: no password on a command line or in a file), which applies the migrations first.

Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, the build script puts the accounts back as they were made
(their password, their state, no phone number, no recovery codes); with `APP_ENVIRONMENT=Development ENVIRONMENT_ONLY=1`
it runs the app in development (`Production` again for a live app).

## Steps

### `aspnet-core-session.steps.js` (22)

- `Given I am a logged in user with the "administrator" user`
- `Given I am not logged in`
- `Given I am on the login page`
- `When I go to the login page`
- `When I log in as "administrator" with the login form`
- `When I submit the login form as "twofactoruser"`
- `When I log in with the email "user@example.com" and the password "Wrong-password-1"`
- `Then the login should be refused with "Invalid login attempt."`
- `Then I should be on the login page`
- `Then I should see the login form`
- `When I log out`
- `When I go to the logout page`
- `Then I should be asked to confirm the logout`
- `When I confirm the logout`
- `Then I should be logged in`
- `Then I should be logged in as "administrator"`
- `When I close the browser and open it again`
- `When my session expires`
- `Then I should be back on the page I asked for`
- `Then the session cookie should be HttpOnly`
- `Then the session cookie should be SameSite Lax`
- `Then the session cookie should last 14 days`

### `aspnet-core-two-factor.steps.js` (10)

- `Then I should be asked for the authenticator code`
- `When I enter the authenticator code of "twofactoruser"`
- `When I enter the authenticator code "000000"`
- `Then the authenticator code should be refused with "Invalid authenticator code."`
- `When I set up two-factor authentication with an authenticator app`
- `When I verify the authenticator app with the code "123456"`
- `When I turn two-factor authentication off`
- `Then two-factor authentication should be on`
- `Then I should see 10 recovery codes`
- `Then this browser should be remembered for two-factor sign-in`

### `aspnet-core-mail.steps.js` (4)

- `Then an email with the subject "Reset your password" should be sent to "user"`
- `Then no email should be sent to "nobody@example.com"`
- `Then the email with the subject "Reset your password" to "user" should contain "If you didn't request a password reset, you can ignore this email."`
- `When I open the "clicking here" link of the email to "user"`

### `aspnet-core-account.steps.js` (15)

- `When I ask for a password reset link for "user"`
- `When I reset the password of "user" on the reset page`
- `When I ask for a new confirmation email for "unconfirmeduser"`
- `When I try to register with:`
- `Then I should see the lockout page`
- `Then I should see the access denied page`
- `When I go to the "Password" page of my account`
- `Then I should be on the "Password" page of my account`
- `Then I should see the status message "Your profile has been updated"`
- `When I change my password to "Changed-Pass-123"`
- `When I change my password back`
- `When I change my email to "user-changed@example.com"`
- `When I change my email back`
- `When I download my personal data`
- `Then my personal data should show "Email" as "user@example.com"`

### `aspnet-core-access.steps.js` (7)

- `Then I should not be allowed to open "/Admin"`
- `Then every form that posts on this page should carry an anti-forgery token`
- `Then the form of the "Log in" button should carry an anti-forgery token`
- `When I press "Save" with a forged token`
- `When a page of another site sends a form to "/Identity/Account/Logout"`
- `When a page of another site sends a form to "/Movies/Edit/2" with:`
- `Then the form of the other site should be refused`

### `aspnet-core-errors.steps.js` (4)

- `Then I should see the 404 error page`
- `Then the page should not show debug information`
- `Then I should see the developer exception page`
- `Then the error page should show its request ID`

### `aspnet-core-forms.steps.js` (7)

- `Then the "Email" field should have the error "The Email field is required."`
- `Then the "Email" field should have no error`
- `Then the form should show the errors:`
- `Then the form should show the error "Username 'user@example.com' is already taken."`
- `Then the form should show no errors`
- `When I press "Create" with the checks of the page turned off`
- `Then the details should show "Genre" as "Comedy"`

Text, links, buttons, fields, rows, cookies, downloads and the accessibility checks are webship-js's own steps
(`I should see "…"`, `I press "…"`, `I fill in "…" with "…"`, `I click "Edit" in the "Ghostbusters" row`,
`the downloaded file name should be "…"`); this pack adds what the framework decides.

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads the same on every system (one
`cucumber.js` profile per system; the platform packs are not meant to be loaded together). Loaded beside each of the
37 published packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "…" user` | codeigniter, discourse, django, django-cms, drupal-core, joomla, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, spring-boot, strapi, symfony, typo3, wordpress |
| `I log out` | codeigniter, discourse, django, django-cms, drupal-core, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, spring-boot, strapi, symfony, typo3, wordpress |
| `I should be logged in` | codeigniter, discourse, django, django-cms, drupal-core, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, spring-boot, strapi, symfony, typo3, wordpress |
| `I should be logged in as "…"` | backdrop-cms, codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, odoo, payload, spring-boot, strapi, symfony, typo3 |
| `I am not logged in` | discourse, django, django-cms, drupal-core, joomla, keycloak, nextcloud, odoo, payload, spring-boot, strapi, typo3, wordpress |
| `I log in as "…" with the login form` | codeigniter, discourse, django, keycloak, laravel, mediawiki, moodle, nextcloud, nextjs, payload, spring-boot, strapi, symfony |
| `I should see the login form` | codeigniter, django-cms, drupal-core, joomla, laravel, moodle, nextjs, odoo, spring-boot, symfony, wordpress |
| `I am on the login page` | django-cms, drupal-core, joomla, keycloak, nextcloud, odoo, spring-boot, wordpress |
| `the login should be refused with "…"` | discourse, django, keycloak, mediawiki, nextcloud, payload, spring-boot, strapi |
| `I log in with the username "…" and the password "…"` | discourse, keycloak, moodle, nextcloud, spring-boot, symfony |
| `I should not be allowed to open "…"` | discourse, django, django-cms, payload, spring-boot, strapi |
| `no email should be sent to "…"` | codeigniter, keycloak, laravel, nextcloud, symfony, woocommerce |
| `I log in with the email "…" and the password "…"` | codeigniter, laravel, nextjs, payload, strapi |
| `I should be on the login page` | discourse, keycloak, nextcloud, spring-boot, wordpress |
| `an email with the subject "…" should be sent to "…"` | codeigniter, keycloak, laravel, symfony, woocommerce |
| `the "…" field should have the error "…"` | craft-cms, keycloak, laravel, spring-boot, symfony |
| `the email with the subject "…" to "…" should contain "…"` | codeigniter, keycloak, laravel, symfony, woocommerce |
| `I go to the login page` | django-cms, keycloak, nextcloud, spring-boot |
| `I open the "…" link of the email to "…"` | codeigniter, keycloak, laravel, symfony |
| `I should see the 404 error page` | codeigniter, laravel, spring-boot, symfony |
| `the "…" field should have no error` | keycloak, laravel, spring-boot, symfony |
| `the page should not show debug information` | codeigniter, laravel, spring-boot, symfony |
| `I ask for a password reset link for "…"` | keycloak, laravel, nextcloud |
| `I should see the status message "…"` | drupal-core, keycloak, laravel |
| `a page of another site sends a form to "…"` | laravel, spring-boot, symfony |
| `I change my password to "…"` | django, nextcloud |
| `I close the browser and open it again` | keycloak, spring-boot |
| `I press "…" with a forged token` | spring-boot, symfony |
| `I should see the access denied page` | magento, prestashop |
| `my session expires` | codeigniter, spring-boot |
| `the form should show the error "…"` | django, squarespace |
| `I confirm the logout` | spring-boot |
| `I enter the one-time code "…"` | keycloak |
| `I enter the one-time code of "…"` | keycloak |
| `I go to the logout page` | spring-boot |
| `I should be asked for a one-time code` | keycloak |
| `I should be asked to confirm the logout` | spring-boot |
| `I should be back on the page I asked for` | spring-boot |
| `I submit the login form as "…"` | keycloak |
| `I try to register with:` | keycloak |
| `every form that posts on this page should carry a CSRF token` | spring-boot |
| `the form of the "…" button should carry a CSRF token` | spring-boot |
| `the form should show no errors` | spring-boot |
| `the form should show the errors:` | spring-boot |
| `the one-time code should be refused with "…"` | keycloak |
| `the session cookie should be HttpOnly` | spring-boot |

None matches a webship-js step, and none matches a phrase of the component pack (Bootstrap) or of the Diffy pack,
which can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../aspnet-core-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite of the Razor Pages app
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
APP_ENVIRONMENT=Development ENVIRONMENT_ONLY=1 SITE_DIR="$PWD/../aspnet-core-site" .github/scripts/build-ddev-site.sh
FEATURES=tests/development npx cucumber-js
MUST_FAIL_DIR=tests/development npm run test:must-fail
TEMPLATE=blazor SITE_DIR="$PWD/../aspnet-core-site" .github/scripts/build-ddev-site.sh
FEATURES=tests/blazor ACCOUNT_PATH=/Account PROTECTED_PATH=/auth npx cucumber-js
```

## How the steps were written

Every step was written from a round of manual testing of the real local apps in the browser first: each page it
touches was opened as the account the step works as, its roles, labels and messages noted, and the signal it gives
while it loads or saves found (the page load of a form, the redirect to the login page, the status of the page). The
failures of the first runs went back to the browser before the step changed: the click lost when an error line goes
away under a button, the second button of the Blazor login form, the recovery codes a set-up shows only once, the
forms of the Blazor Web App checked in the browser and protected without a token.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The logo in this README is the .NET logo from Simple Icons 16.37.0 (CC0-1.0), filled with the colour the set lists
for the brand; ASP.NET Core is part of .NET. The .NET and ASP.NET names and logos are trademarks of their owner; this
pack is not affiliated with or endorsed by them.
