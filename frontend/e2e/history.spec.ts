import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

test.describe("note history", () => {
  test("compares an earlier version and restores it without losing the current text", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, {
      name: uniqueName("History"),
      content: "First line\nShared",
    });
    await request.patch(`${API_URL}/notes/${note.id}`, {
      data: { name: note.name, content: "Second line\nShared" },
    });

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "History", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "History" });
    await sheet.getByRole("button", { name: /characters/ }).click();
    await expect(sheet.getByText("− First line")).toBeVisible();
    await expect(sheet.getByText("+ Second line")).toBeVisible();

    await sheet.getByRole("button", { name: "Restore…" }).click();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    const unchanged = await (await request.get(`${API_URL}/notes/${note.id}`)).json();
    expect(unchanged.content).toBe("Second line\nShared");

    await sheet.getByRole("button", { name: "Restore…" }).click();
    await sheet.getByRole("button", { name: "Restore this version" }).click();
    await expect(sheet).toBeHidden();
    await expect
      .poll(async () => (await (await request.get(`${API_URL}/notes/${note.id}`)).json()).content)
      .toBe("First line\nShared");

    const revisions = await (await request.get(`${API_URL}/notes/${note.id}/revisions`)).json();
    expect(revisions).toHaveLength(2);
    const newest = await (
      await request.get(`${API_URL}/notes/${note.id}/revisions/${revisions[0].id}`)
    ).json();
    expect(newest.content).toBe("Second line\nShared");
  });

  test("a note without edits shows an empty history", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Fresh") });
    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "History", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "History" }).getByText("No earlier versions yet."),
    ).toBeVisible();
  });
});
