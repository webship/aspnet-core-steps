@mail @password-reset
Feature: A forgotten password and the confirmation mail
  As a person who forgot a password, or never confirmed an email address
  I want the app to mail me a link that works, and nobody else a thing
  So that I get back in without help, and nobody learns which addresses have an account

  @critical
  Scenario: A forgotten password is reset through the link in the mail
    Given I am not logged in
    When I ask for a password reset link for "user"
    Then I should see "Please check your email to reset your password."
    And an email with the subject "Reset your password" should be sent to "user"
    And the email with the subject "Reset your password" to "user" should contain "If you didn't request a password reset, you can ignore this email."
    When I open the "clicking here" link of the email to "user"
    And I reset the password of "user" on the reset page
    Then I should see "Your password has been reset."
    When I go to the login page
    And I log in as "user" with the login form
    Then I should be logged in as "user"

  Scenario: An unknown address and an unconfirmed one get the same answer, and no mail
    Given I am not logged in
    When I ask for a password reset link for "nobody@example.com"
    Then I should see "Please check your email to reset your password."
    And no email should be sent to "nobody@example.com"
    When I ask for a password reset link for "unconfirmeduser"
    Then I should see "Please check your email to reset your password."
    And no email should be sent to "unconfirmeduser"

  Scenario: An account that has not confirmed its address gets the confirmation mail again
    Given I am not logged in
    When I ask for a new confirmation email for "unconfirmeduser"
    Then I should see the status message "Verification email sent. Please check your email."
    And an email with the subject "Confirm your email" should be sent to "unconfirmeduser"
    And the email with the subject "Confirm your email" to "unconfirmeduser" should contain "Please confirm your account by clicking here"

  Scenario: The link of the confirmation mail confirms the address
    Given I am not logged in
    When I ask for a new confirmation email for "user"
    And I open the "clicking here" link of the email to "user"
    Then I should see "Thank you for confirming your email."

  Scenario: An unknown address is told the same as a known one, and gets no mail
    Given I am not logged in
    When I ask for a new confirmation email for "nobody@example.com"
    Then I should see the status message "Verification email sent. Please check your email."
    And no email should be sent to "nobody@example.com"
