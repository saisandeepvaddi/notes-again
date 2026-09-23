import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("the sidebar reaches every top-level page", async ({ page }) => {
    await page.goto("/notes");

    const pages: [label: string, urlPart: string, heading: string][] = [
      ["Review", "/review", "Review"],
      ["Import", "/import", "Import"],
      ["Organize", "/organize", "Organize"],
      ["Trash", "/trash", "Trash"],
      ["Settings", "/settings", "Settings"],
      ["All Notes", "/notes", "All Notes"],
    ];

    for (const [label, urlPart, heading] of pages) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(urlPart.replace("/", "\\/") + "$"));
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
  });

  test("/ redirects to /notes", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/notes$/);
  });
});
