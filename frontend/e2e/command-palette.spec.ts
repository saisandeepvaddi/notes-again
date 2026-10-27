import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

const uniqueWord = () => `zq${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

test.describe("command palette", () => {
  test("finds a note by a word in its body and opens it", async ({ page, request }) => {
    const word = uniqueWord();
    const note = await createNote(request, {
      name: uniqueName("Palette target"),
      content: `Somewhere in here is ${word} in the middle of a sentence.`,
    });

    await page.goto("/notes");
    await expect(page.getByRole("heading", { level: 1, name: "All Notes" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+/");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("combobox").fill(word);
    const option = dialog.getByRole("option", { name: new RegExp(note.name) });
    await expect(option).toBeVisible();
    await expect(option.locator("mark", { hasText: word })).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/notes/${note.id}$`));
    await expect(dialog).toBeHidden();
  });

  test("opens from inside the editor and gives focus back on Escape", async ({ page, request }) => {
    const note = await createNote(request, {
      name: uniqueName("Editor focus"),
      content: "A paragraph to click into.",
    });

    await page.goto(`/notes/${note.id}`);
    await page.getByText("A paragraph to click into.").click();
    await page.keyboard.press("ControlOrMeta+/");
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("[contenteditable='true']:focus")).toHaveCount(1);
  });

  test("runs commands in > mode", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: /^Search/ }).click();
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    await dialog.getByRole("combobox").fill("> review");
    await expect(dialog.getByRole("option", { name: /^Review/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/review$/);
  });

  test("lists recently opened notes when the query is empty", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Recently opened") });

    await page.goto(`/notes/${note.id}`);
    await expect(page).toHaveTitle(new RegExp(note.name));
    await page.goto("/notes");
    await expect(page.getByRole("heading", { level: 1, name: "All Notes" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+/");

    const recent = page.getByRole("group", { name: "Recent" });
    await expect(recent.getByRole("option", { name: note.name })).toBeVisible();
  });

  test("typing digits in the palette during review doesn't rate the card", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, {
      name: uniqueName("Due during palette"),
      first_reminder_at: "1970-01-01T00:00:00Z",
    });

    await page.goto("/review");
    const cardTitle = page.getByRole("heading", { level: 2 }).first();
    await expect(cardTitle).toBeVisible();
    const before = await cardTitle.textContent();

    await page.keyboard.press("ControlOrMeta+/");
    await page.getByRole("combobox").pressSequentially("1234");
    await page.keyboard.press("Escape");

    await expect(cardTitle).toHaveText(before ?? "");
    await request.delete(`${API_URL}/notes/${note.id}`);
  });
});
