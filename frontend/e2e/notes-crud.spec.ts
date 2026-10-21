import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

const contentEditor = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "editable markdown" });

const noteDetailNameInput = (page: import("@playwright/test").Page) =>
  page.getByLabel("Note title");

async function moveNoteToTrash(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "More note actions" }).click();
  await page.getByRole("button", { name: "Move to trash", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Move to trash" }).click();
}

test.describe("note lifecycle", () => {
  test("create, edit, delete, restore, and permanently delete a note", async ({ page }) => {
    const name = uniqueName("CRUD note");
    const editedName = `${name} (edited)`;

    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await contentEditor(page).click();
    await page.keyboard.type("Original content for the CRUD test.");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/\d+$/);
    await expect(page.getByRole("button", { name: "More note actions" })).toBeVisible();
    await expect(page.getByText("Original content for the CRUD test.")).toBeVisible();

    await page.getByRole("button", { name: "Edit title" }).click();
    await noteDetailNameInput(page).fill(editedName);
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
    await contentEditor(page).click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Edited content for the CRUD test.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5000 });

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: editedName })).toBeVisible();
    await expect(page.getByText("Edited content for the CRUD test.")).toBeVisible();

    await moveNoteToTrash(page);
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
    await moveNoteToTrash(page);
    await page.goto("/trash");
    const trashCardAgain = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("heading", { name: editedName, exact: true }) });
    await trashCardAgain.getByRole("button", { name: "Delete Forever" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete Forever" }).click();
    await expect(page.getByRole("heading", { name: editedName, exact: true })).toHaveCount(0);
  });

  test("leaving immediately after editing saves the note before navigating", async ({
    page,
    request,
  }) => {
    const name = uniqueName("Quick edit");
    const note = await createNote(request, { name });
    const editedName = `${name} updated`;

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "Edit title" }).click();
    await noteDetailNameInput(page).fill(editedName);
    await page.locator("main").getByRole("link", { name: "All Notes" }).click();

    await expect(page).toHaveURL(/\/notes$/);
    const response = await request.get(`http://127.0.0.1:8210/api/notes/${note.id}`);
    expect((await response.json()).name).toBe(editedName);
  });

  test("deleting a note can be undone from the notification", async ({ page, request }) => {
    const name = uniqueName("Undo delete");
    const note = await createNote(request, {
      name,
      content: "This note should return after undo.",
    });

    await page.goto(`/notes/${note.id}`);
    await expect(page).toHaveTitle(`${name} · Notes Again`);
    await page.getByRole("button", { name: "More note actions" }).click();
    await page.getByRole("button", { name: "Move to trash", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Move this note to trash?")).toBeVisible();
    await dialog.getByRole("button", { name: "Move to trash" }).click();

    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByText("Note moved to trash", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("This note should return after undo.")).toBeVisible();
  });

  test("unknown routes show a useful not-found page", async ({ page }) => {
    await page.goto("/there-is-no-page-here");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to notes" })).toBeVisible();
    await expect(page).toHaveTitle("Page not found · Notes Again");
  });

  test("invalid and missing note IDs show a not-found page", async ({ page }) => {
    for (const id of ["adsf", "999999999"]) {
      const noteRequests: string[] = [];
      const recordRequest = (request: import("@playwright/test").Request) => {
        if (request.url().includes("/api/notes/")) noteRequests.push(request.url());
      };
      page.on("request", recordRequest);
      await page.goto(`/notes/${id}`);
      await expect(page.getByRole("heading", { name: "Note not found" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to notes" })).toBeVisible();
      expect(noteRequests.some((url) => url.endsWith("/NaN"))).toBe(false);
      page.off("request", recordRequest);
    }
  });

  test("search filters the notes list", async ({ page, request }) => {
    const name = uniqueName("Searchable note");
    await createNote(request, { name, content: "unique searchable body" });

    await page.goto("/notes");
    await page.getByLabel("Search notes").fill(name);
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

    await page.getByLabel("Search notes").fill(uniqueName("no such note"));
    await expect(page.getByRole("heading", { name: "No notes match" })).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByLabel("Search notes")).toHaveValue("");
  });
});
