@blazor @access @errors
Feature: Who may open what, and the error pages of a Blazor Web App

  Scenario: A visitor is sent to the login page for the pages behind it
    Given I am not logged in
    Then I should not be allowed to open "/auth"
    And I should not be allowed to open "/Admin"
    But I should be allowed to open "/"

  Scenario: An account without the role is shown the access denied page, the Administrator role gets in
    Given I am a logged in user with the "user" user
    When I go to "/Admin"
    Then I should see the access denied page
    Given I am a logged in user with the "administrator" user
    Then I should be allowed to open "/Admin"
    And I should see "lockeduser@example.com" in the "lockeduser@example.com" row

  Scenario: A form another site sends is refused
    Given I am not logged in
    When a page of another site sends a form to "/Account/Login" with:
      | _handler       | login            |
      | Input.Email    | user@example.com |
      | Input.Password | Wrong-password-1 |
    Then the form of the other site should be refused

  @js-off
  Scenario: An exception shows the app's error page, with a request ID and no debug information
    Given I am not logged in
    When I go to "/Throw"
    Then I should see the 500 error page
    And I should see "An error occurred while processing your request."
    And the error page should show its request ID
    And the page should not show debug information

  @js-off
  Scenario: A page that does not exist shows the status code page of the app
    Given I am not logged in
    When I go to "/no/such/page"
    Then I should see the 404 error page
    And I should see "Sorry, the content you are looking for does not exist."
    And the page should not show debug information
