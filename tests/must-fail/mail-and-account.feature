@must-fail
Feature: The mail and account steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios change nothing.

  Scenario: An unknown address gets no reset mail
    Fails with: No mail "Reset your password" came to nobody@example.com in this scenario.
    Given I am not logged in
    When I ask for a password reset link for "nobody@example.com"
    Then an email with the subject "Reset your password" should be sent to "nobody@example.com"

  Scenario: A confirmed account gets its reset mail
    Fails with: A mail came to user@example.com: "Reset your password".
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then no email should be sent to "user"

  Scenario: The reset mail says what it says
    Fails with: does not say "Your code is". It says:
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then the email with the subject "Reset your password" to "user" should contain "Your code is"

  Scenario: The login page is not the lockout page
    Fails with: Expected the Lockout page (/Identity/Account/Lockout), but the browser shows HTTP 200 at /Identity/Account/Login
    Given I am on the login page
    Then I should see the lockout page

  Scenario: The administrator is not shown the access denied page
    Fails with: Expected the Access denied page (/Identity/Account/AccessDenied), but the browser shows HTTP 200 at /Admin
    Given I am a logged in user with the "administrator" user
    When I go to "/Admin"
    Then I should see the access denied page

  Scenario: The Manage pages say which page is on screen
    Fails with: Expected the "Email" page of the account, but the "Password" page is on screen.
    Given I am a logged in user with the "user" user
    When I go to the "Password" page of my account
    Then I should be on the "Email" page of my account

  Scenario: A page that did nothing shows no status message
    Fails with: The page does not show the status message "Your profile has been updated". It shows: (none).
    Given I am a logged in user with the "user" user
    When I go to the "Profile" page of my account
    Then I should see the status message "Your profile has been updated"

  Scenario: The personal data names the account it belongs to
    Fails with: The personal data shows "Email" as "user@example.com", not "administrator@example.com".
    Given I am a logged in user with the "user" user
    When I download my personal data
    Then my personal data should show "Email" as "administrator@example.com"
