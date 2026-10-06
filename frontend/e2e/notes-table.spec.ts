import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

test.describe("notes table rows", () => {
  test("a row opens its note while links and buttons inside it keep working", async ({
    page,
    context,
    request,
  }) => {
    await context.route("https://leetcode.com/**", (route) =>
      route.fulfill({ body: "<html><body>stub</body></html>", contentType: "text/html" }),
    );
    const prefix = uniqueName("RowClick");
    const linked = await createNote(request, {
      name: `[${prefix} two sum](https://leetcode.com/problems/two-sum)`,
      content: "Hash map from value to index.",
    });

    await page.goto(`/notes?q=${encodeURIComponent(prefix)}`);
    await page.getByRole("button", { name: "Table view" }).click();
    const row = page.getByRole("row").filter({ hasText: `${prefix} two sum` });
    await expect(row).toBeVisible();

    const popupPromise = page.waitForEvent("popup");
    await row
      .getByRole("link", { name: `${prefix} two sum` })
      .last()
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/leetcode\.com\/problems\/two-sum/);
    await popup.close();
    await expect(page).toHaveURL(/\/notes\?/);

    await row.getByText("Hash map from value to index.").click();
    await expect(page).toHaveURL(new RegExp(`/notes/${linked.id}$`));
  });

  test("buttons inside a row do not open the note", async ({ page, request }) => {
    const prefix = uniqueName("RowButton");
    await createNote(request, { name: `${prefix} note`, content: "Body" });

    await page.goto(`/notes?q=${encodeURIComponent(prefix)}`);
    await page.getByRole("button", { name: "Table view" }).click();
    const row = page.getByRole("row").filter({ hasText: `${prefix} note` });
    await row.getByRole("button", { name: "Review now" }).click();
    await page.getByText("How well did you remember it?").click();
    await expect(page).toHaveURL(/\/notes\?/);
    await page.keyboard.press("Escape");

    await row.getByRole("button", { name: "Delete note" }).click();
    await expect(page).toHaveURL(/\/notes\?/);
    await expect(row).toHaveCount(0);
  });
});
