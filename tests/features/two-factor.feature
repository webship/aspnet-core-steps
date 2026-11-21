@two-factor
Feature: Two-factor sign-in with an authenticator app
  As a person who protects an account with an authenticator app
  I want the app to ask for a code after my password, take the right code and refuse a wrong one
  So that a stolen password is not enough to get in

  @critical
  Scenario: The app asks for the code after the password, and the code of the app lets the account in
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    Then I should be asked for the authenticator code
    And I should see "Your login is protected with an authenticator app. Enter your authenticator code below."
    When I enter the authenticator code of "twofactoruser"
    Then I should be logged in as "twofactoruser"

  Scenario: A wrong code is refused
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    And I enter the authenticator code "000000"
    Then the authenticator code should be refused with "Invalid authenticator code."
    And I should not be logged in

  Scenario: A remembered browser is not asked for a code again, until it is forgotten
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    And I enter the authenticator code of "twofactoruser" with "Remember this machine" checked
    Then this browser should be remembered for two-factor sign-in
    When I log out
    And I submit the login form as "twofactoruser"
    Then I should be logged in as "twofactoruser"
    When I go to the "Two-factor authentication" page of my account
    And I press "Forget this browser"
    Then I should see the status message "The current browser has been forgotten. When you login again from this browser you will be prompted for your 2fa code."
    And this browser should not be remembered for two-factor sign-in

  Scenario: The account sets up an authenticator app, logs in with its code, and turns it off again
    Given I am a logged in user with the "user" user
    When I go to the "Two-factor authentication" page of my account
    Then two-factor authentication should be off
    When I set up two-factor authentication with an authenticator app
    Then I should see the status message "Your authenticator app has been verified."
    And two-factor authentication should be on
    When I follow "Reset recovery codes"
    And I press "Generate Recovery Codes"
    Then I should see the status message "You have generated new recovery codes."
    And I should see 10 recovery codes
    When I log out
    And I submit the login form as "user"
    Then I should be asked for the authenticator code
    When I enter the authenticator code of "user"
    Then I should be logged in as "user"
    When I turn two-factor authentication off
    Then I should see the status message "2fa has been disabled. You can reenable 2fa when you setup an authenticator app"
    And two-factor authentication should be off

  Scenario: The set-up refuses a code that is not the app's
    Given I am a logged in user with the "user" user
    When I verify the authenticator app with the code "123456"
    Then the form should show the error "Verification code is invalid."
    And two-factor authentication should be off
