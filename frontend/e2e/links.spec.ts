import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

test.describe("note links", () => {
  test("linking a note shows a backlink, survives a rename and opens the target", async ({
    page,
    request,
  }) => {
    const targetName = uniqueName("Target");
    const target = await createNote(request, { name: targetName, content: "Target body" });
    const source = await createNote(request, {
      name: uniqueName("Source"),
      content: "Source body",
    });

    await page.goto(`/notes/${source.id}`);
    await page.getByRole("button", { name: "Link note" }).click();
    await page.getByLabel("Search notes to link").fill(targetName);
    await page.getByRole("button", { name: new RegExp(targetName) }).click();

    await expect
      .poll(async () => (await (await request.get(`${API_URL}/notes/${source.id}`)).json()).content)
      .toMatch(/\]\(note:[a-f0-9]{32}\)/);

    await request.patch(`${API_URL}/notes/${target.id}`, {
      data: { name: uniqueName("Renamed") },
    });

    await page.goto(`/notes/${target.id}`);
    const linked = page.getByRole("region", { name: "Linked from" });
    await expect(linked).toContainText("Linked from 1 note");
    await linked.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/notes/${source.id}$`));

    await page.locator(".markdown-content a", { hasText: targetName }).click();
    await page.getByRole("button", { name: "Open linked note" }).click();
    await expect(page).toHaveURL(new RegExp(`/notes/${target.id}$`));
  });
});
