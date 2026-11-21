@manage
Feature: The Manage pages of an account
  As a person with an account
  I want to change my profile, my email and my password, and get my personal data
  So that my account stays right, and I know what the app keeps about me

  Scenario: The Manage pages link to each other
    Given I am a logged in user with the "user" user
    When I go to the "Profile" page of my account
    Then I should be on the "Profile" page of my account
    When I go to the "Password" page of my account
    Then I should be on the "Password" page of my account
    And I should see "Change password"
    When I go to the "Personal data" page of my account
    Then I should be on the "Personal data" page of my account

  Scenario: The profile takes a phone number, refuses a bad one, and gives it up again
    Given I am a logged in user with the "user" user
    When I go to the "Profile" page of my account
    And I fill in "Phone number" with "+1 555 0100"
    And I press "Save"
    Then I should see the status message "Your profile has been updated"
    When I fill in "Phone number" with "not a phone"
    And I press "Save"
    Then the "Phone number" field should have the error "The Phone number field is not a valid phone number."
    When I fill in "Phone number" with ""
    And I press "Save"
    Then I should see the status message "Your profile has been updated"
    And the form should show no errors

  Scenario: The password page refuses a wrong current password
    Given I am a logged in user with the "user" user
    When I go to the "Password" page of my account
    And I fill in "Current password" with "Wrong-password-1"
    And I fill in "New password" with "Changed-Pass-123"
    And I fill in "Confirm new password" with "Changed-Pass-123"
    And I press "Update password"
    Then the form should show the error "Incorrect password."

  Scenario: A changed password is the one that logs in, until it is changed back
    Given I am a logged in user with the "user" user
    When I change my password to "Changed-Pass-123"
    Then I should see the status message "Your password has been changed."
    When I log out
    And I log in with the email "user@example.com" and the password "Changed-Pass-123"
    Then I should be logged in as "user"
    When I change my password back
    Then I should see the status message "Your password has been changed."

  Scenario: A new email is confirmed through the mail it gets, and changed back
    Given I am a logged in user with the "user" user
    When I change my email to "user-changed@example.com"
    Then I should see the status message "Confirmation link to change email sent. Please check your email."
    And an email with the subject "Confirm your email" should be sent to "user-changed@example.com"
    When I open the "clicking here" link of the email to "user-changed@example.com"
    Then I should see "Thank you for confirming your email change."
    And I should be logged in as "user"
    When I change my email back
    Then I should be logged in as "user"

  Scenario: The same email is no change
    Given I am a logged in user with the "user" user
    When I change my email to "user@example.com"
    Then I should see the status message "Your email is unchanged."

  Scenario: The personal data of the account downloads as a file
    Given I am a logged in user with the "user" user
    When I download my personal data
    Then the downloaded file name should be "PersonalData.json"
    And my personal data should show "Email" as "user@example.com"
    And my personal data should show "EmailConfirmed" as "True"
    And my personal data should show "TwoFactorEnabled" as "False"
