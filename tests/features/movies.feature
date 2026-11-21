@movies @forms
Feature: The pages of a record behind the login, and their validation messages
  As a person who keeps the records of the app
  I want the list, the form, the details and the delete page to work, and a form to say what it refuses
  So that the records stay right

  Background:
    Given I am a logged in user with the "user" user

  Scenario: The list shows the records, and the search narrows it
    When I go to "/Movies"
    Then I should see "Ghostbusters" in the "Ghostbusters" row
    And I should see "Rio Bravo"
    When I fill in "Title:" with "Ghost"
    And I press "Filter"
    Then I should see "Ghostbusters 2"
    And I should not see "Rio Bravo"

  Scenario: The page's own checks refuse an empty form before it is sent
    When I go to "/Movies/Create"
    And I press "Create"
    Then the form should show the errors:
      | field        | error                               |
      | Title        | The Title field is required.        |
      | Release Date | The Release Date field is required. |
      | Genre        | The Genre field is required.        |
      | Price        | The Price field is required.        |
      | Rating       | The Rating field is required.       |

  Scenario: The app refuses what the page would have refused, with the same messages
    When I go to "/Movies/Create"
    And I fill in "Title" with "Ab"
    And I fill in "Release Date" with "2026-11-21"
    And I fill in "Genre" with "comedy"
    And I fill in "Price" with "500"
    And I fill in "Rating" with "PG"
    And I press "Create" with the checks of the page turned off
    Then the "Title" field should have the error "The field Title must be a string with a minimum length of 3 and a maximum length of 60."
    And the "Genre" field should have the error "The field Genre must match the regular expression '^[A-Z]+[a-zA-Z\s]*$'."
    And the "Price" field should have the error "The field Price must be between 1 and 100."
    And the "Rating" field should have no error
    And the "Release Date" field should have no error

  Scenario: A record is created, shown, changed and deleted
    When I go to "/Movies/Create"
    And I fill in "Title" with "The Webship Test Movie"
    And I fill in "Release Date" with "2026-11-21"
    And I fill in "Genre" with "Drama"
    And I fill in "Price" with "5.50"
    And I fill in "Rating" with "PG"
    And I press "Create"
    Then I should see "The Webship Test Movie" in the "The Webship Test Movie" row
    When I click "Details" in the "The Webship Test Movie" row
    Then the details should show "Genre" as "Drama"
    And the details should show "Rating" as "PG"
    When I click "Edit"
    And I fill in "Genre" with "Comedy"
    And I press "Save"
    Then I should see "Comedy" in the "The Webship Test Movie" row
    When I click "Delete" in the "The Webship Test Movie" row
    Then I should see "Are you sure you want to delete this?"
    And the details should show "Title" as "The Webship Test Movie"
    When I press "Delete"
    Then I should not see "The Webship Test Movie"
