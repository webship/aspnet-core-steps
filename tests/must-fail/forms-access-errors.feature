@must-fail
Feature: The form, access and error steps fail with a message that says what was found
  # Each scenario asserts something that is not true on the test site: its last step must fail with the message
  # its description names, and a hint (tests/check-must-fail.js). The scenarios change nothing.

  Scenario: A field error is named as the page writes it
    Fails with: The "Email" field does not show the error "Email is required.". It shows "The Email field is required.".
    Given I am not logged in
    When I try to register with:
      | Email            |  |
      | Password         |  |
      | Confirm Password |  |
    Then the "Email" field should have the error "Email is required."

  Scenario: A refused field has an error
    Fails with: The "Email" field shows the error "The Email field is required.".
    Given I am not logged in
    When I try to register with:
      | Email            |  |
      | Password         |  |
      | Confirm Password |  |
    Then the "Email" field should have no error

  Scenario: The errors of a form are named as the page writes them
    Fails with: "Password": expected "The Password field cannot be empty.", found "The Password field is required."
    Given I am not logged in
    When I try to register with:
      | Email            |  |
      | Password         |  |
      | Confirm Password |  |
    Then the form should show the errors:
      | field    | error                               |
      | Email    | The Email field is required.        |
      | Password | The Password field cannot be empty. |

  Scenario: The summary of a refused login is its own
    Fails with: The form does not show the error "Incorrect password.". It shows: "Invalid login attempt.".
    Given I am on the login page
    When I log in with the email "user@example.com" and the password "Wrong-password-1"
    Then the form should show the error "Incorrect password."

  Scenario: A refused login shows an error
    Fails with: The form shows errors: "Invalid login attempt.".
    Given I am on the login page
    When I log in with the email "user@example.com" and the password "Wrong-password-1"
    Then the form should show no errors

  Scenario: The details show the value the record has
    Fails with: The details show "Genre" as "Comedy", not "Western".
    Given I am a logged in user with the "user" user
    When I go to "/Movies/Details/2"
    Then the details should show "Genre" as "Western"

  Scenario: A visitor may not open the records
    Fails with: Expected /Movies to open for this session, but it was refused: the browser shows the login page
    Given I am not logged in
    Then I should be allowed to open "/Movies"

  Scenario: Anybody may open the home page
    Fails with: Expected / to be refused to this session, but it opened: HTTP 200 at /
    Given I am not logged in
    Then I should not be allowed to open "/"

  Scenario: The home page of a visitor has no form that posts
    Fails with: No form of this page posts (HTTP 200 at /, "Home page - TestApp").
    Given I am not logged in
    Then every form that posts on this page should carry an anti-forgery token

  Scenario: A form that does not post carries no token
    Fails with: The form of the "Filter" button carries no anti-forgery token (__RequestVerificationToken).
    Given I am a logged in user with the "user" user
    When I go to "/Movies"
    Then the form of the "Filter" button should carry an anti-forgery token

  Scenario: No form of another site was sent
    Fails with: No page of another site sent a form in this scenario.
    Given I am not logged in
    Then the form of the other site should be refused

  @js-off
  Scenario: An exception is not a missing page
    Fails with: Expected the 404 error page, but the browser shows HTTP 500 at /Throw
    Given I am not logged in
    When I go to "/Throw"
    Then I should see the 404 error page

  Scenario: The home page is no error page
    Fails with: Expected the 500 error page, but the browser shows HTTP 200 at /
    Given I am not logged in
    Then I should see the 500 error page

  @js-off
  Scenario: A live app does not show the developer exception page
    Fails with: Expected the developer exception page, but the browser shows HTTP 500 at /Throw
    Given I am not logged in
    When I go to "/Throw"
    Then I should see the developer exception page

  Scenario: A page that is no error page gives no request ID
    Fails with: The error page shows no request ID (HTTP 200 at /
    Given I am not logged in
    Then the error page should show its request ID
