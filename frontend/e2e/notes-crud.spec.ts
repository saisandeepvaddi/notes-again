import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

const contentEditor = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "editable markdown" });

const noteDetailNameInput = (page: import("@playwright/test").Page) =>
  page.getByLabel("Note title");

test.describe("note lifecycle", () => {
  test("create, edit, delete, restore, and permanently delete a note", async ({ page }) => {
    const name = uniqueName("CRUD note");
    const editedName = `${name} (edited)`;

    await page.goto("/notes/new");
    await page.getByPlaceholder("Name").fill(name);
    await contentEditor(page).click();
    await page.keyboard.type("Original content for the CRUD test.");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/\d+$/);
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await expect(page.getByText("Original content for the CRUD test.")).toBeVisible();

    await page.getByRole("button", { name: "Edit title" }).click();
    await noteDetailNameInput(page).fill(editedName);
    await contentEditor(page).click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Edited content for the CRUD test.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5000 });

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: editedName })).toBeVisible();
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
