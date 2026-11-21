@antiforgery
Feature: The anti-forgery token of every form
  As the owner of the app
  I want every form that posts to carry a token, and a form without the right one refused
  So that another site cannot act for a signed-in person

  Scenario: The forms of the account pages carry their token
    Given I am not logged in
    When I go to the login page
    Then every form that posts on this page should carry an anti-forgery token
    And the form of the "Log in" button should carry an anti-forgery token
    And the anti-forgery cookie should be HttpOnly
    And the anti-forgery cookie should be SameSite Strict
    When I go to "/Identity/Account/Register"
    Then every form that posts on this page should carry an anti-forgery token

  Scenario: The forms of a signed-in account carry their token
    Given I am a logged in user with the "user" user
    When I go to "/Identity/Account/Manage"
    Then every form that posts on this page should carry a CSRF token
    And the form of the "Logout" button should carry a CSRF token
    When I go to "/Movies/Create"
    Then every form that posts on this page should carry an anti-forgery token

  @js-off
  Scenario: A login form sent with a forged token is refused
    Given I am on the login page
    When I fill in "Email" with "user@example.com"
    And I fill in "Password" with "Wrong-password-1"
    And I press "Log in" with a forged token
    Then I should see the 400 error page
    And I should not be logged in

  @js-off
  Scenario: A change sent with a forged token is refused, and nothing changes
    Given I am a logged in user with the "user" user
    When I go to "/Movies/Edit/2"
    And I fill in "Price" with "1.00"
    And I press "Save" with a forged token
    Then I should see the 400 error page
    When I go to "/Movies/Details/2"
    Then the details should show "Price" as "¤8.99"

  Scenario: A form another site sends is refused, and nothing changes
    Given I am a logged in user with the "user" user
    When a page of another site sends a form to "/Movies/Edit/2" with:
      | Movie.Id          | 2          |
      | Movie.Title       | Hacked     |
      | Movie.ReleaseDate | 2000-01-01 |
      | Movie.Genre       | Comedy     |
      | Movie.Price       | 1          |
      | Movie.Rating      | G          |
    Then the form of the other site should be refused
    Given I am a logged in user with the "user" user
    When I go to "/Movies/Details/2"
    Then the details should show "Title" as "Ghostbusters"
