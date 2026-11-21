@register
Feature: Registration refuses what it must
  As the owner of the app
  I want the registration form to refuse a missing field, a bad address, a weak or mismatched password and a taken address
  So that only sound accounts are made; a suite tests the refusals only and never makes an account

  Scenario: The form refuses empty fields before it is sent
    Given I am not logged in
    When I try to register with:
      | Email            |  |
      | Password         |  |
      | Confirm Password |  |
    Then the form should show the errors:
      | field    | error                           |
      | Email    | The Email field is required.    |
      | Password | The Password field is required. |

  Scenario: A bad address and a confirmation that does not match are refused
    Given I am not logged in
    When I try to register with:
      | Email            | not-an-address   |
      | Password         | Webship-Pass-123 |
      | Confirm Password | Webship-Pass-456 |
    Then the "Email" field should have the error "The Email field is not a valid e-mail address."
    And the "Confirm Password" field should have the error "The password and confirmation password do not match."
    And the "Password" field should have no error

  Scenario: The app refuses a weak password with its rules
    Given I am not logged in
    When I try to register with:
      | Email            | new-person@example.com |
      | Password         | abcdef                 |
      | Confirm Password | abcdef                 |
    Then the form should show the error "Passwords must have at least one non alphanumeric character."
    And the form should show the error "Passwords must have at least one digit ('0'-'9')."
    And the form should show the error "Passwords must have at least one uppercase ('A'-'Z')."

  Scenario: An address that has an account already is refused
    Given I am not logged in
    When I try to register with:
      | Email            | user@example.com |
      | Password         | Webship-Pass-123 |
      | Confirm Password | Webship-Pass-123 |
    Then the form should show the error "Username 'user@example.com' is already taken."
