'use strict';

// Server-rendered forms: the validation message next to each refused field (the page's own checks before the form
// is sent, and the app's after it: the same place, `span[data-valmsg-for]` or `.validation-message`), the errors of
// the whole form (its validation summary), a form sent without the page's own checks (so the app's checks answer),
// and the details a page lists (a `dl` of labels and values, as the pages the official scaffolder writes have).

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./aspnet-core-helpers');

/** The errors of a field, waited for: the page's checks write them as the cursor leaves a field or the form is sent. */
async function errorsOfField(world, name, check) {
  const field = await h.findField(world, name);
  let errors = [];
  try {
    await h.eventually(world, async () => {
      errors = await h.fieldErrors(field);
      return errors;
    }, check, () => ({ message: '' }), 3000);
  } catch { /* the caller says what was found */ }
  return errors;
}

/**
 * Assert the validation message next to a field (found by its label), as the page's own checks or the app's write
 * it ("The Email field is required.", "The password and confirmation password do not match.").
 *
 * Example #1: Then the "Email" field should have the error "The Email field is required."
 * Example #2: Then the "Confirm Password" field should have the error "The password and confirmation password do not match."
 * Example #3: And the "Title" field should have the error "The field Title must be a string with a minimum length of 3 and a maximum length of 60."
 * Example #4: Then the "Phone number" field should have the error "The Phone number field is not a valid phone number."
 * Example #5: And the "Price" field should have the error "The field Price must be between 1 and 100."
 */
Then(/^the "([^"]*)" field should have the error "([^"]*)"$/, async function (name, expected) {
  const errors = await errorsOfField(this, name, (list) => list.some((e) => h.clean(e) === h.clean(expected)));
  if (!errors.some((e) => h.clean(e) === h.clean(expected))) {
    const refused = await h.refusedFields(this);
    throw friendly({
      message: `The "${name}" field does not show the error "${expected}". ${errors.length ? `It shows ${h.listed(errors)}.` : 'It shows no error.'}${refused.length ? ` Fields with errors: ${refused.map((f) => `${f.field} (${h.listed(f.errors)})`).join('; ')}.` : ''}`,
      hint: 'Name the field by its label and the message as the page writes it; the page shows a field\'s message next to it once the form was sent or the cursor left the field.',
    });
  }
});

/**
 * Assert that a field (found by its label) shows no validation message.
 *
 * Example #1: Then the "Email" field should have no error
 * Example #2: Then the "Password" field should have no error
 * Example #3: And the "Genre" field should have no error
 * Example #4: Then the "Rating" field should have no error
 * Example #5: But the "Phone number" field should have no error
 */
Then(/^the "([^"]*)" field should have no error$/, async function (name) {
  const errors = await errorsOfField(this, name, (list) => list.length === 0);
  if (errors.length) {
    throw friendly({ message: `The "${name}" field shows the error ${h.listed(errors)}.`, hint: 'The value of the field was refused: look at the message, or at the value the scenario typed.' });
  }
});

/**
 * Assert the validation messages of a form, field by field (a table with the columns field and error). A field may
 * be listed more than once for more than one message.
 *
 * Example #1: Then the form should show the errors:
 * Example #2: And the form should show the errors:
 * Example #3: Then the form should show the errors:
 * Example #4: Then the form should show the errors:
 * Example #5: But the form should show the errors:
 */
Then(/^the form should show the errors:$/, async function (table) {
  const wanted = table.hashes().map((row) => ({ field: row.field || row.Field, error: row.error || row.Error }));
  const problems = [];
  for (const { field, error } of wanted) {
    const errors = await errorsOfField(this, field, (list) => list.some((e) => h.clean(e) === h.clean(error)));
    if (!errors.some((e) => h.clean(e) === h.clean(error))) problems.push(`"${field}": expected "${error}", found ${h.listed(errors)}`);
  }
  if (problems.length) {
    throw friendly({ message: `The form does not show the errors of the table: ${problems.join('; ')}.`, hint: 'Name each field by its label and each message as the page writes it (the table has the columns field and error).' });
  }
});

/**
 * Assert an error the form shows, wherever the page writes it: its validation summary (a message the app gives for
 * the form rather than one field: "Username 'user@example.com' is already taken.", "Incorrect password."), its error
 * status message ("Error: ..." in a Blazor Web App), or the message next to one of its fields ("Verification code is
 * invalid." is a field's on the default account pages and the page's in a Blazor Web App).
 *
 * Example #1: Then the form should show the error "Username 'user@example.com' is already taken."
 * Example #2: Then the form should show the error "Incorrect password."
 * Example #3: And the form should show the error "Passwords must have at least one digit ('0'-'9')."
 * Example #4: Then the form should show the error "Invalid login attempt."
 * Example #5: And the form should show the error "Verification code is invalid."
 */
Then(/^the form should show the error "([^"]*)"$/, async function (expected) {
  let errors = [];
  const wanted = h.clean(expected).replace(/^error:\s*/i, '');
  await h.eventually(this, async () => {
    const fields = (await h.refusedFields(this)).flatMap((f) => f.errors);
    errors = [...(await h.formErrors(this)), ...fields].map((e) => h.clean(e).replace(/^error:\s*/i, ''));
    return errors;
  }, (list) => list.includes(wanted), () => ({
    message: `The form does not show the error "${expected}". It shows: ${h.listed(errors)}.`,
    hint: 'The step reads the validation summary of the form, its error messages and the messages next to its fields; name the message as the page writes it.',
  }));
});

/**
 * Assert that the form shows no validation message at all: no field error and no error of the whole form.
 *
 * Example #1: Then the form should show no errors
 * Example #2: And the form should show no errors
 * Example #3: Then the form should show no errors
 * Example #4: But the form should show no errors
 * Example #5: Then the form should show no errors
 */
Then(/^the form should show no errors$/, async function () {
  await h.settle(this);
  const fields = await h.refusedFields(this);
  const form = await h.formErrors(this);
  if (fields.length || form.length) {
    throw friendly({ message: `The form shows errors: ${[...fields.map((f) => `${f.field} (${h.listed(f.errors)})`), ...form.map((e) => `"${e}"`)].join('; ')}.`, hint: 'The app refused a value of the form.' });
  }
});

/**
 * Press a button of a form with the page's own checks turned off for that form (the scripts that check the fields
 * before the form is sent, and the browser's), so the form reaches the app and its own validation answers: the app
 * must refuse what the page would have refused. The step waits for the page the app answers with.
 *
 * Example #1: When I press "Create" with the checks of the page turned off
 * Example #2: When we press "Save" with the checks of the page turned off
 * Example #3: And I press "Register" with the checks of the page turned off
 * Example #4: When I press "Update password" with the checks of the page turned off
 * Example #5: When I press "Log in" with the checks of the page turned off
 */
When(/^(I |we )*press "([^"]*)" with the checks of the page turned off$/, async function (pronounCase, words) {
  const button = await h.buttonNamed(this, words);
  const turnedOff = await button.evaluate((el) => {
    const form = el.form || el.closest('form');
    if (!form) return false;
    // The browser's own checks, and the page's scripts that check the fields when the form is sent (jQuery
    // validation's handlers, a Blazor form's client validation): the next submit event of the page is stopped before
    // any of them sees it, and the browser sends the form as it is, with the button's name and its formaction.
    form.noValidate = true;
    window.addEventListener('submit', (event) => event.stopImmediatePropagation(), { capture: true, once: true });
    return true;
  });
  if (!turnedOff) throw friendly({ message: `The button "${words}" is in no form.`, hint: 'Name a button that sends a form.' });
  await h.pressAndWait(this, button, { label: `Sending the form of "${words}" without the page's checks` });
});

/**
 * Assert a value of the details a page lists (a `dl` of labels and values, as the Details and Delete pages the
 * official scaffolder writes have): the label as the page writes it, and its value.
 *
 * Example #1: Then the details should show "Genre" as "Comedy"
 * Example #2: Then the details should show "Title" as "Ghostbusters"
 * Example #3: And the details should show "Release Date" as "03/13/1984"
 * Example #4: Then the details should show "Rating" as "G"
 * Example #5: And the details should show "Title" as "The Test Movie"
 */
Then(/^the details should show "([^"]*)" as "([^"]*)"$/, async function (label, expected) {
  let pairs = [];
  await h.eventually(this, async () => {
    pairs = await this.page.evaluate(() => [...document.querySelectorAll('dl dt')].map((dt) => {
      let dd = dt.nextElementSibling;
      while (dd && dd.tagName !== 'DD') dd = dd.nextElementSibling;
      return { label: dt.textContent.replace(/\s+/g, ' ').trim(), value: dd ? dd.textContent.replace(/\s+/g, ' ').trim() : '' };
    })).catch(() => []);
    return pairs;
  }, (list) => list.some((p) => p.label.toLowerCase() === label.toLowerCase() && p.value === expected), () => {
    const pair = pairs.find((p) => p.label.toLowerCase() === label.toLowerCase());
    return pair
      ? { message: `The details show "${label}" as "${pair.value}", not "${expected}".`, hint: 'The details list the values the app keeps now.' }
      : { message: `The details have no "${label}". They have: ${h.listed(pairs.map((p) => p.label))}.`, hint: 'Name the label as the page writes it (a dt of the details list).' };
  });
});
