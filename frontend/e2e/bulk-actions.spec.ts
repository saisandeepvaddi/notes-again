import { expect, test, type Page } from "@playwright/test";
import { API_URL, createNote, createProject, uniqueName } from "./support/api";

// The search box's own filtering is debounced (300ms) and, once it lands,
// resets any selection made on the pre-filter list (NotesList clears
// selection whenever its `search` prop changes). Selecting checkboxes before
// that debounced navigation actually fires gets silently wiped out a moment
// later, so wait for the URL to reflect the filter before selecting anything.
async function searchAndWait(page: Page, query: string) {
  await page.getByLabel("Search notes").fill(query);
  await page.waitForURL((url) => url.searchParams.get("q") === query);
}

test.describe("bulk selection actions", () => {
  test("selecting two notes and moving them to a project applies to both", async ({
    page,
    request,
  }) => {
    const prefix = uniqueName("BulkGroup");
    const noteA = await createNote(request, { name: `${prefix} A` });
    const noteB = await createNote(request, { name: `${prefix} B` });
    const project = await createProject(request, uniqueName("Bulk target project"));

    await page.goto("/notes");
    await searchAndWait(page, prefix);
    await expect(page.getByRole("link", { name: noteA.name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: noteB.name, exact: true })).toBeVisible();

    await page.getByLabel(`Select ${noteA.name}`).click();
    await page.getByLabel(`Select ${noteB.name}`).click();

    const toolbar = page.getByRole("toolbar", { name: "Selection actions" });
    await expect(toolbar.getByText("2 selected")).toBeVisible();

    await toolbar.getByRole("button", { name: "Project" }).click();
    // cmdk re-sorts its option list by relevance via direct DOM moves as it
    // scores items, which can detach/reattach nodes out from under a click
    // aimed at an unfiltered list. Filtering to a single match first avoids
    // the reshuffle.
    await page.getByPlaceholder("Move to project...").fill(project.name);
    await page.getByRole("option", { name: project.name, exact: true }).click();

    await expect(toolbar).toHaveCount(0);

    for (const note of [noteA, noteB]) {
      const response = await request.get(`${API_URL}/notes/${note.id}`);
      const updated = await response.json();
      expect(updated.project?.id).toBe(project.id);
    }
  });

  test("bulk delete moves selected notes to Trash", async ({ page, request }) => {
    const prefix = uniqueName("BulkDeleteGroup");
    const noteA = await createNote(request, { name: `${prefix} A` });
    const noteB = await createNote(request, { name: `${prefix} B` });

    await page.goto("/notes");
    await searchAndWait(page, prefix);
    await page.getByLabel(`Select ${noteA.name}`).click();
    await page.getByLabel(`Select ${noteB.name}`).click();

    const toolbar = page.getByRole("toolbar", { name: "Selection actions" });
    await toolbar.getByRole("button", { name: "Delete" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Move 2 notes to Trash?")).toBeVisible();
    await dialog.getByRole("button", { name: "Move to Trash" }).click();

    await expect(page.getByText("No notes match this filter.")).toBeVisible();

    for (const note of [noteA, noteB]) {
      const response = await request.get(`${API_URL}/notes/${note.id}`);
      expect(response.status()).toBe(404);
    }
  });
});
