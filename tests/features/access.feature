@access
Feature: Who may open what
  As the owner of the app
  I want each page to let in only the accounts it is for
  So that a visitor and an account without the role are kept out

  @critical
  Scenario: A visitor is sent to the login page for the pages behind it
    Given I am not logged in
    Then I should not be allowed to open "/Movies"
    And I should not be allowed to open "/Admin"
    And I should not be allowed to open "/Identity/Account/Manage"
    But I should be allowed to open "/"
    And I should be allowed to open "/Privacy"

  @js-off
  Scenario: An account without the role is shown the access denied page
    Given I am a logged in user with the "user" user
    When I go to "/Admin"
    Then I should see the access denied page
    And I should see "You do not have access to this resource."
    And I should not be allowed to open "/Admin"
    But I should be allowed to open "/Movies"

  Scenario: The Administrator role opens the administration page
    Given I am a logged in user with the "administrator" user
    Then I should be allowed to open "/Admin"
    And I should see "Administration"
    And I should see "lockeduser@example.com" in the "lockeduser@example.com" row
