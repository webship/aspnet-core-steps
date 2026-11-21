@blazor @session
Feature: Logging in and out of a Blazor Web App
  # The account pages of a Blazor Web App are components of the app (under /Account): the same steps as on the default
  # account pages, with ACCOUNT_PATH=/Account and PROTECTED_PATH=/auth (the template's page that needs a session).

  @critical
  Scenario: A visitor is sent to the login page, and back to the page after the login
    Given I am not logged in
    When I go to "/auth"
    Then I should be on the login page
    And I should see the login form
    When I log in as "user" with the login form
    Then I should be back on the page I asked for
    And I should see "You are authenticated"
    And I should be logged in as "user"

  Scenario: A wrong password, an unknown account and an unconfirmed email are refused with the same words
    Given I am on the login page
    When I log in with the email "user@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid login attempt."
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid login attempt."
    When I submit the login form as "unconfirmeduser"
    Then the login should be refused with "Invalid login attempt."
    And I should not be logged in

  Scenario: A locked-out account is sent to the lockout page
    Given I am on the login page
    When I submit the login form as "lockeduser"
    Then I should see the lockout page
    And I should not be logged in

  Scenario: The logout button of the navigation ends the session
    Given I am not logged in
    And I am on the login page
    When I log in as "administrator" with the login form
    Then I should be logged in as "administrator"
    When I log out
    Then I should not be logged in

  Scenario: With "Remember me" the session outlives the browser; without it, it does not
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form and "Remember me" checked
    Then the session cookie should last 14 days
    And the session cookie should be HttpOnly
    And the session cookie should be Secure
    When I close the browser and open it again
    Then I should be logged in as "user"
    When I log out
    And I log in as "user" with the login form
    Then the session cookie should end with the browser
    When I close the browser and open it again
    Then I should not be logged in

  Scenario: A session the app no longer accepts sends the browser to the login page
    Given I am not logged in
    And I am on the login page
    When I log in as "user" with the login form
    And my session expires
    And I go to "/auth"
    Then I should be on the login page
