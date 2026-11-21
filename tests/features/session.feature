@session
Feature: Logging in and out
  As a person with an account of the app
  I want the login page to let me in, refuse a wrong password and remember me when I ask it to
  So that my account is mine alone

  @critical
  Scenario: A visitor is sent to the login page, and back to the page after the login
    Given I am not logged in
    When I go to "/Movies"
    Then I should be on the login page
    And I should see the login form
    When I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should be logged in as "user"

  Scenario Outline: The <account> account logs in through the login form
    Given I am not logged in
    When I go to the login page
    And I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | user          |

  Scenario: A wrong password and an unknown account are refused with the same words
    Given I am on the login page
    When I log in with the email "user@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid login attempt."
    And I should see the login form
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid login attempt."
    And I should not be logged in

  Scenario: An account whose email is not confirmed cannot log in
    Given I am on the login page
    When I submit the login form as "unconfirmeduser"
    Then the login should be refused with "Invalid login attempt."
    And I should not be logged in

  Scenario: A locked-out account is sent to the lockout page
    Given I am on the login page
    When I submit the login form as "lockeduser"
    Then I should see the lockout page
    And I should see "This account has been locked out, please try again later."
    And I should not be logged in

  Scenario: The logout button of the navigation ends the session
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    Then I should be logged in
    When I log out
    Then I should not be logged in
    And I should see "Login"

  Scenario: The logout page asks first, and its button logs out
    Given I am a logged in user with the "administrator" user
    When I go to the logout page
    Then I should be asked to confirm the logout
    When I confirm the logout
    Then I should not be logged in

  Scenario: Without "Remember me?" the session ends with the browser
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    Then the session cookie should end with the browser
    And the session cookie should be HttpOnly
    And the session cookie should be Secure
    And the session cookie should be SameSite Lax
    When I close the browser and open it again
    Then I should not be logged in

  Scenario: With "Remember me?" the session outlives the browser for 14 days
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form and "Remember me?" checked
    Then the session cookie should last 14 days
    When I close the browser and open it again
    Then I should be logged in as "user"
    When I log out
    Then I should not be logged in

  Scenario: A session the app no longer accepts sends the browser to the login page, and back after the login
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    And my session expires
    And I go to "/Movies"
    Then I should be on the login page
    When I log in as "user" with the login form
    Then I should be back on the page I asked for
