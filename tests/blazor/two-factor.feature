@blazor @two-factor
Feature: Two-factor sign-in in a Blazor Web App

  @critical
  Scenario: The app asks for the code after the password, and the code of the app lets the account in
    Given I am not logged in
    And I am on the login page
    When I submit the login form as "twofactoruser"
    Then I should be asked for the authenticator code
    When I enter the authenticator code "000000"
    Then the authenticator code should be refused with "Invalid authenticator code."
    When I enter the authenticator code of "twofactoruser"
    Then I should be logged in as "twofactoruser"

  Scenario: The account sets up an authenticator app, logs in with its code, and turns it off again
    Given I am a logged in user with the "user" user
    Then two-factor authentication should be off
    When I verify the authenticator app with the code "123456"
    Then the form should show the error "Verification code is invalid."
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
