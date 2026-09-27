import { expect, test } from "@playwright/test";
import { createNote, createTag, uniqueName } from "./support/api";

// The list's filters live in the URL, so the back button walks back through
// them (and back *to* them from a note) instead of resetting the list.
test.describe("notes list filters in the URL", () => {
  test("back from a note restores the filters, then steps back through them", async ({
    page,
    request,
  }) => {
    const tag = await createTag(request, uniqueName("url-tag"));
    const tagged = await createNote(request, { name: uniqueName("Tagged"), tag_ids: [tag.id] });
    const untagged = await createNote(request, { name: uniqueName("Untagged") });

    await page.goto(`/notes?tagId=${tag.id}`);
    await expect(page.getByRole("link", { name: tagged.name, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: untagged.name, exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Active", exact: true }).click();
    await expect(page).toHaveURL(/status=active/);
    await page.getByRole("button", { name: "Show only today" }).click();
    await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);

    await page.getByRole("button", { name: /Show All/ }).click();
    await expect(page).not.toHaveURL(/date=/);
    await page.getByRole("link", { name: tagged.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/notes/${tagged.id}$`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`tagId=${tag.id}`));
    await expect(page).toHaveURL(/status=active/);
    await expect(page.getByRole("button", { name: "Active", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("link", { name: untagged.name, exact: true })).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/date=/);
    await expect(page.getByRole("button", { name: /Show All/ })).toBeVisible();

    await page.goBack();
    await page.goBack();
    await expect(page).not.toHaveURL(/status=/);
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("table sort is in the URL and survives a reload", async ({ page, request }) => {
    await createNote(request, { name: uniqueName("Sortable") });
    await page.goto("/notes");
    await page.getByRole("button", { name: "Table view" }).click();

    await page.getByRole("button", { name: "Note", exact: true }).click();
    await expect(page).toHaveURL(/sort=name/);
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await expect(page).toHaveURL(/order=desc/);

    await page.reload();
    await expect(page).toHaveURL(/sort=name/);
    await expect(page).toHaveURL(/order=desc/);

    await page.goBack();
    await expect(page).toHaveURL(/sort=name/);
    await expect(page).not.toHaveURL(/order=/);
  });

  test("changing a filter drops the page, but back restores it", async ({ page }) => {
    await page.goto("/notes?page=3&pageSize=10");
    await page.getByRole("button", { name: "Active", exact: true }).click();
    await expect(page).toHaveURL(/status=active/);
    await expect(page).not.toHaveURL(/page=3/);

    await page.goBack();
    await expect(page).toHaveURL(/page=3/);
  });

  test("malformed params fall back to unset instead of erroring", async ({ page }) => {
    await page.goto("/notes?tagId=abc&status=bogus&date=nope&sort=wat&page=-2");
    await expect(page.getByRole("heading", { name: "All Notes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Show only today" })).toBeVisible();
  });
});
