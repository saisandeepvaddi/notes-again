import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

// MDXEditor exposes its contenteditable region as a textbox named "editable
// markdown"; there's only ever one per page.
const contentEditor = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "editable markdown" });

// The note-detail name field has no placeholder/label to key off (unlike the
// new-note form's), and routes are code-split -- the URL updates before the
// route's own chunk/component finishes mounting, so a plain `input().first()`
// right after a URL assertion can still catch the previous page's own first
// input mid-transition. Its font-serif styling is otherwise unique to it.
const noteDetailNameInput = (page: import("@playwright/test").Page) =>
  page.locator('input[class*="font-serif"]');

test.describe("note lifecycle", () => {
  test("create, edit, delete, restore, and permanently delete a note", async ({ page }) => {
    const name = uniqueName("CRUD note");
    const editedName = `${name} (edited)`;

    await page.goto("/notes/new");
    await page.getByPlaceholder("Name").fill(name);
    await contentEditor(page).click();
    await page.keyboard.type("Original content for the CRUD test.");
    await page.getByRole("button", { name: "Create" }).click();

    // Creating redirects to the list; the new note shows up there.
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/\d+$/);
    // Unique to the (fully mounted) detail page -- waiting for it rules out
    // still being mid-transition from the list page before editing below.
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await expect(page.getByText("Original content for the CRUD test.")).toBeVisible();

    // Editing autosaves (debounced) rather than needing an explicit save action.
    await noteDetailNameInput(page).fill(editedName);
    await contentEditor(page).click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Edited content for the CRUD test.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5000 });

    // Persisted, not just in local state.
    await page.reload();
    await expect(noteDetailNameInput(page)).toHaveValue(editedName);
    await expect(page.getByText("Edited content for the CRUD test.")).toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("link", { name: editedName, exact: true })).toHaveCount(0);

    await page.goto("/trash");
    const trashCard = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: editedName, exact: true }) });
    await expect(trashCard).toBeVisible();

    await trashCard.getByRole("button", { name: "Restore" }).click();
    await expect(trashCard).toHaveCount(0);

    await page.goto("/notes");
    await expect(page.getByRole("link", { name: editedName, exact: true })).toBeVisible();

    // Trash it again so it can be permanently removed.
    await page.getByRole("link", { name: editedName, exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.goto("/trash");
    const trashCardAgain = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: editedName, exact: true }) });
    await trashCardAgain.getByRole("button", { name: "Delete Forever" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete Forever" }).click();
    await expect(page.getByRole("heading", { name: editedName, exact: true })).toHaveCount(0);
  });

  test("search filters the notes list", async ({ page, request }) => {
    const name = uniqueName("Searchable note");
    await createNote(request, { name, content: "unique searchable body" });

    await page.goto("/notes");
    await page.getByLabel("Search notes").fill(name);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.getByLabel("Search notes").fill(uniqueName("no such note"));
    await expect(page.getByText("No notes match this filter.")).toBeVisible();
  });
});
