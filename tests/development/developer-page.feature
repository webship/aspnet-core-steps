@development
Feature: A development run shows the developer exception page
  # Run against the app in the Development environment (the build script with APP_ENVIRONMENT=Development
  # ENVIRONMENT_ONLY=1): the page the steps of a live app must catch, should an app go out in development.

  @js-off
  Scenario: An exception shows the developer exception page, with the exception and its stack
    Given I am not logged in
    When I go to "/Throw"
    Then I should see the 500 error page
    And I should see the developer exception page
    And I should see "InvalidOperationException"
