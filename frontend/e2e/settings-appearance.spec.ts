import { expect, test } from "@playwright/test";

test.describe("appearance settings", () => {
  test("the reading font choice applies to notes and survives a reload", async ({ page }) => {
    await page.goto("/settings?section=appearance");

    await page.getByRole("radio", { name: /^Serif/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-reading-font", "serif");

    await page.goto("/notes");
    await expect(page.locator("html")).toHaveAttribute("data-reading-font", "serif");

    await page.goto("/settings");
    await page.getByRole("radio", { name: /^Sans-serif/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-reading-font", "sans");
  });

  test("note width and editor border apply to the note page and survive a reload", async ({
    page,
  }) => {
    await page.goto("/settings?section=appearance");
    await expect(page.locator("html")).toHaveAttribute("data-note-align", "center");
    await expect(page.locator("html")).toHaveAttribute("data-note-border", "off");

    await page.getByRole("radio", { name: "Left" }).click();
    await page.getByRole("switch").click();
    await expect(page.locator("html")).toHaveAttribute("data-note-align", "left");
    await expect(page.locator("html")).toHaveAttribute("data-note-border", "on");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-note-align", "left");
    await expect(page.getByRole("radio", { name: "Left" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch")).toBeChecked();

    await page.getByRole("radio", { name: "Centered" }).click();
    await page.getByRole("switch").click();
    await expect(page.locator("html")).toHaveAttribute("data-note-align", "center");
    await expect(page.locator("html")).toHaveAttribute("data-note-border", "off");
  });

  test("sections are reachable from the settings tabs", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "API tokens" }).click();
    await expect(page).toHaveURL(/section=tokens/);
    await expect(page.getByRole("heading", { name: "API tokens" })).toBeVisible();
  });
});
