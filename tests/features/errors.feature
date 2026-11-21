@errors
Feature: The error pages of a live app
  As the owner of the app
  I want a failure to show the app's own error page, and nothing of the code behind it
  So that a visitor is told what happened and an attacker learns nothing

  @js-off @critical
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
    And I should see "404 Not Found"
    And the page should not show debug information

  @js-off
  Scenario: A record that does not exist answers 404 too
    Given I am a logged in user with the "user" user
    When I go to "/Movies/Details/9999"
    Then I should see the 404 error page
    And the page should not show debug information

  @js-off
  Scenario: The pages of a signed-in account show no debug information either
    Given I am a logged in user with the "administrator" user
    When I go to "/Throw"
    Then I should see the 500 error page
    And the page should not show debug information
