import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

test.describe("link editing", () => {
  test("a rendered link can be edited back to new text and URL", async ({ page, request }) => {
    const note = await createNote(request, {
      name: uniqueName("Link note"),
      content: "See [Google](https://google.com) for details.",
    });

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("link", { name: "Google" }).click();
    const popover = page.locator('[data-slot="popover-content"]');
    await expect(popover.getByRole("link", { name: "https://google.com" })).toBeVisible();

    await popover.getByRole("button", { name: "Edit link" }).click();
    await popover.getByLabel("URL", { exact: true }).fill("https://duckduckgo.com");
    await popover.getByLabel("Text", { exact: true }).fill("DuckDuckGo");
    await popover.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 5000 });
    const saved = await (await request.get(`${API_URL}/notes/${note.id}`)).json();
    expect(saved.content).toContain("[DuckDuckGo](https://duckduckgo.com)");
  });
});
