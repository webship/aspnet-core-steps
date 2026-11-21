@must-fail
Feature: The session steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios only read.

  Scenario: A login that worked is not a refusal
    Fails with: Expected the login to be refused, but the browser left the login page
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    Then the login should be refused with "Invalid login attempt."

  Scenario: The refusal is named as the page writes it
    Fails with: The login page does not say "Bad credentials". It says: "Invalid login attempt."
    Given I am on the login page
    When I log in with the email "user@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Bad credentials"

  Scenario: Another account is not the one signed in
    Fails with: Expected "administrator" (administrator@example.com) to be logged in, but the navigation names "Hello user@example.com!"
    Given I am a logged in user with the "user" user
    Then I should be logged in as "administrator"

  Scenario: A visitor is not logged in
    Fails with: Expected to be logged in, but /Movies sent the browser to the login page.
    Given I am not logged in
    Then I should be logged in

  Scenario: A signed-in account is logged in
    Fails with: Expected nobody to be logged in, but /Movies opened without the login page
    Given I am a logged in user with the "user" user
    Then I should not be logged in

  Scenario: The home page is not the login page
    Fails with: Expected the login page (/Identity/Account/Login), but the browser shows HTTP 200 at /
    Given I am not logged in
    Then I should be on the login page

  Scenario: The home page has no login form
    Fails with: Expected to see the login form, but it did not appear
    Given I am not logged in
    Then I should see the login form

  Scenario: The login page has a login form
    Fails with: Expected not to see the login form, but it is on the page.
    Given I am on the login page
    Then I should not see the login form

  Scenario: A login without "Remember me?" gives a session cookie
    Fails with: ends with the browser: it has no expiry.
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    Then the session cookie should last 14 days

  Scenario: The anti-forgery cookie is not Secure by default
    Fails with: is not Secure (HttpOnly: true, Secure: false, SameSite: Strict).
    Given I am on the login page
    Then the anti-forgery cookie should be Secure

  Scenario: The session cookie is not SameSite Strict
    Fails with: is SameSite Lax, not Strict.
    Given I am a logged in user with the "user" user
    Then the session cookie should be SameSite Strict

  Scenario: No page was asked for before a login started on the login page
    Fails with: No page sent the browser to the login page in this scenario, so no page was asked for.
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for

  Scenario: The home page does not ask to confirm a logout
    Fails with: Expected the Logout page with its button, but the browser shows HTTP 200 at /
    Given I am a logged in user with the "user" user
    When I go to "/"
    Then I should be asked to confirm the logout

  Scenario: A signed-in account is not asked for a code
    Fails with: Expected the page that asks for the code of an authenticator app (/Identity/Account/LoginWith2fa), but the browser shows HTTP 200 at /
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "user"
    Then I should be asked for the authenticator code

  Scenario: The right code is not refused
    Fails with: Expected the code to be refused, but the browser left the page of the code
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    And I enter the authenticator code of "twofactoruser"
    Then the authenticator code should be refused with "Invalid authenticator code."

  Scenario: Two-factor sign-in is off for an account without an authenticator app
    Fails with: Two-factor sign-in is off for this account, not on.
    Given I am a logged in user with the "administrator" user
    Then two-factor authentication should be on

  Scenario: A browser that did not tick "Remember this machine" is not remembered
    Fails with: This browser holds no cookie "Identity.TwoFactorRememberMe": it is not remembered for two-factor sign-in.
    Given I am not logged in
    Then this browser should be remembered for two-factor sign-in
