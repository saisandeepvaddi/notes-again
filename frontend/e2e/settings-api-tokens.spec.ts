import { expect, test } from "@playwright/test";
import { uniqueName } from "./support/api";

test.describe("settings", () => {
  test("changing the default algorithm persists across reload", async ({ page }) => {
    await page.goto("/settings");
    const trigger = page.getByRole("combobox");
    // Scoped to the value span, not the trigger button as a whole -- the
    // trigger also contains the chevron icon.
    const value = trigger.locator('[data-slot="select-value"]');
    const current = (await value.textContent())?.trim();
    const other = current === "FSRS" ? "SM-2" : "FSRS";

    await trigger.click();
    await page.getByRole("option", { name: other, exact: true }).click();
    await expect(value).toHaveText(other);

    await page.reload();
    await expect(page.locator('[data-slot="select-value"]')).toHaveText(other);
  });

  test("creating and revoking an API token", async ({ page }) => {
    const tokenName = uniqueName("E2E token");

    await page.goto("/settings");
    await page.getByRole("button", { name: "Create token" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(tokenName);
    await dialog.getByRole("button", { name: "Create token" }).click();

    // The plaintext token is shown exactly once, right after creation.
    const tokenField = dialog.getByLabel("API token");
    await expect(tokenField).toHaveValue(/^nal_/);
    await dialog.getByRole("button", { name: "Done" }).click();

    const tokenRow = page.locator("li").filter({ hasText: tokenName });
    await expect(tokenRow).toBeVisible();
    await expect(tokenRow.getByText("never used")).toBeVisible();

    await tokenRow.getByRole("button", { name: "Revoke" }).click();
    const confirmDialog = page.getByRole("alertdialog");
    await confirmDialog.getByRole("button", { name: "Revoke token" }).click();

    await expect(page.locator("li").filter({ hasText: tokenName })).toHaveCount(0);
  });
});
