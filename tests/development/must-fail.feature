@must-fail @development
Feature: The step that guards a live app fails on a development run
  # Run against the app in the Development environment (MUST_FAIL_DIR=tests/development npm run test:must-fail):
  # its last step must fail with the message its description names, and a hint.

  @js-off
  Scenario: The developer exception page is debug information
    Fails with: The page shows debug information: the developer exception page ("An unhandled exception occurred while processing the request.")
    Given I am not logged in
    When I go to "/Throw"
    Then the page should not show debug information
