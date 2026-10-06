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

  test("sections are reachable from the settings tabs", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("tab", { name: "API tokens" }).click();
    await expect(page).toHaveURL(/section=tokens/);
    await expect(page.getByRole("heading", { name: "API tokens" })).toBeVisible();
  });
});
