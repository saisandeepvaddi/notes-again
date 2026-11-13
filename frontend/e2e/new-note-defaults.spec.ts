import { expect, test } from "@playwright/test";

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
});
