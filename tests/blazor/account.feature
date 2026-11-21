@blazor @mail @manage
Feature: The account pages of a Blazor Web App

  Scenario: A forgotten password is reset through the link in the mail
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then I should see "Please check your email to reset your password."
    And an email with the subject "Reset your password" should be sent to "user"
    When I open the "clicking here" link of the email to "user"
    And I reset the password of "user" on the reset page
    Then I should see "Your password has been reset."
    When I go to the login page
    And I log in as "user" with the login form
    Then I should be logged in as "user"

  Scenario: An unknown address gets the same answer, and no mail
    Given I am not logged in
    When I ask for a password reset link for "nobody@example.com"
    Then I should see "Please check your email to reset your password."
    And no email should be sent to "nobody@example.com"

  Scenario: An account that has not confirmed its address gets the confirmation mail again
    Given I am not logged in
    When I ask for a new confirmation email for "unconfirmeduser"
    Then I should see the status message "Verification email sent. Please check your email."
    And an email with the subject "Confirm your email" should be sent to "unconfirmeduser"

  Scenario: Registration refuses a bad address, a mismatched password and a taken address
    Given I am not logged in
    When I try to register with:
      | Email            | not-an-address   |
      | Password         | Webship-Pass-123 |
      | Confirm Password | Webship-Pass-456 |
    Then the "Email" field should have the error "The Email field is not a valid e-mail address."
    And the "Confirm Password" field should have the error "The password and confirmation password do not match."
    When I try to register with:
      | Email            | user@example.com |
      | Password         | Webship-Pass-123 |
      | Confirm Password | Webship-Pass-123 |
    Then the form should show the error "Username 'user@example.com' is already taken."

  # The profile refuses a bad phone number. It also refuses an empty one (the form keeps an empty field as an empty
  # text, which the phone rule refuses), so a number once saved cannot be taken away there: the suite saves none.
  Scenario: The Manage pages refuse a bad phone number, change the password, and give the personal data
    Given I am a logged in user with the "user" user
    When I go to the "Profile" page of my account
    And I fill in "Phone number" with "not a phone"
    And I press "Save"
    Then the "Phone number" field should have the error "The Phone number field is not a valid phone number."
    When I change my password to "Changed-Pass-123"
    Then I should see the status message "Your password has been changed."
    When I change my password back
    Then I should see the status message "Your password has been changed."
    When I download my personal data
    Then the downloaded file name should be "PersonalData.json"
    And my personal data should show "Email" as "user@example.com"

  Scenario: A new email is confirmed through the mail it gets, and changed back
    Given I am a logged in user with the "user" user
    When I change my email to "user-changed@example.com"
    Then I should see the status message "Confirmation link to change email sent. Please check your email."
    When I open the "clicking here" link of the email to "user-changed@example.com"
    Then I should see "Thank you for confirming your email change."
    And I should be logged in as "user"
    When I change my email back
    Then I should be logged in as "user"
