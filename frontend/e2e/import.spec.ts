import { expect, test } from "@playwright/test";
import { uniqueName } from "./support/api";

test.describe("import", () => {
  test("previewing then committing a JSON import creates the notes", async ({ page }) => {
    const deckName = uniqueName("ImportDeck");
    const noteOne = uniqueName("Imported note one");
    const noteTwo = uniqueName("Imported note two");
    const payload = {
      per_day: 0,
      decks: [
        {
          name: deckName,
          notes: [
            {
              name: noteOne,
              content: "First imported note body.",
              tags: ["import-e2e-tag"],
              difficulty: "easy",
            },
            { name: noteTwo, content: "Second imported note body." },
          ],
        },
      ],
    };

    await page.goto("/import");
    await page.getByRole("tab", { name: "Paste JSON" }).click();
    await page
      .getByPlaceholder('{"decks": [...]} or [{"name": "...", "content": "..."}]')
      .fill(JSON.stringify(payload));

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Preview: nothing has been imported yet")).toBeVisible();
    await expect(page.getByText("notes to import")).toBeVisible();

    const importButton = page.getByRole("button", { name: /Import \d+ notes?/ });
    await importButton.click();

    await expect(page.getByText("Import complete")).toBeVisible();
    await expect(page.getByText("2 notes added.")).toBeVisible();

    await page.getByRole("button", { name: "View notes" }).click();
    await page.getByLabel("Search notes").fill(noteOne);
    await expect(page.getByRole("link", { name: noteOne, exact: true })).toBeVisible();
  });

  test("re-importing the same file skips the duplicates", async ({ page }) => {
    const noteName = uniqueName("Dedup note");
    const payload = { notes: [{ name: noteName, content: "Only once, please." }] };

    await page.goto("/import");
    await page.getByRole("tab", { name: "Paste JSON" }).click();
    const textarea = page.getByPlaceholder(
      '{"decks": [...]} or [{"name": "...", "content": "..."}]',
    );
    await textarea.fill(JSON.stringify(payload));
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("button", { name: /Import \d+ notes?/ }).click();
    await expect(page.getByText("Import complete")).toBeVisible();

    await page.getByRole("button", { name: "Import another file" }).click();
    await textarea.fill(JSON.stringify(payload));
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Skipped rows (1)")).toBeVisible();
    await expect(page.getByText(/a note with this name already exists/)).toBeVisible();
  });

  test("invalid JSON shows an inline error instead of navigating away", async ({ page }) => {
    await page.goto("/import");
    await page.getByRole("tab", { name: "Paste JSON" }).click();
    await page
      .getByPlaceholder('{"decks": [...]} or [{"name": "...", "content": "..."}]')
      .fill("{not valid json");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Can't import that")).toBeVisible();
  });
});
