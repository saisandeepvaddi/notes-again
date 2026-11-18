import { expect, test } from "@playwright/test";
import { API_URL, uniqueName } from "./support/api";

test.describe("new note defaults", () => {
  test("a new note focuses its name and follows the saved defaults until they are turned off", async ({
    page,
  }) => {
    await page.goto("/notes/new");
    await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(page.getByRole("radio", { name: "In review", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.goto("/settings?section=notes");
    await page.getByRole("switch", { name: "Start new notes with these choices" }).click();
    await page
      .getByRole("radiogroup", { name: "Default review status" })
      .getByRole("radio", { name: "Note only" })
      .click();
    await page
      .getByRole("group", { name: "Default difficulty" })
      .getByRole("button", { name: "Hard", exact: true })
      .click();
    await page.getByRole("switch", { name: "No difficulty for note-only notes" }).click();

    await page.goto("/notes/new");
    await expect(page.getByRole("radio", { name: "Note only", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("button", { name: "Hard", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/Draft (saved|restored)/)).toHaveCount(0);

    await page.goto("/settings?section=notes");
    await page.getByRole("switch", { name: "Start new notes with these choices" }).click();
    await page.goto("/notes/new");
    await expect(page.getByRole("radio", { name: "In review", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("note-only notes skip the difficulty choice and are saved without one", async ({
    page,
    request,
  }) => {
    const name = uniqueName("NoDifficulty");
    await page.goto("/notes/new");
    await expect(page.getByRole("button", { name: "None", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "Note only", exact: true }).click();
    await expect(page.getByRole("group", { name: "Difficulty" })).toHaveCount(0);
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: /^(Save|Create)/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/notes(\?|$)/);
    const list = await (
      await request.get(`${API_URL}/notes/list?search=${encodeURIComponent(name)}`)
    ).json();
    const note = list.items.find((item: { name: string }) => item.name === name);
    expect(note.tags.filter((tag: { is_difficulty: boolean }) => tag.is_difficulty)).toHaveLength(
      0,
    );
  });
});
