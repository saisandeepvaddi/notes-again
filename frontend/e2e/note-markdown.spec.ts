import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

test.describe("note as markdown", () => {
  test("copying includes frontmatter and edits that haven't autosaved yet", async ({
    page,
    context,
    request,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const name = uniqueName("Markdown copy");
    const note = await createNote(request, { name, content: "First paragraph." });

    await page.goto(`/notes/${note.id}`);
    await page.getByText("First paragraph.").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Typed just now.");
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "More note actions" }).click();
    await page.getByRole("button", { name: "Copy as Markdown" }).click();
    await expect(page.getByText("Copied as Markdown")).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^---\n/);
    expect(copied).toContain(`title: "${name}"`);
    expect(copied).toContain("status: in-review");
    expect(copied).toContain(`# ${name}\n\nFirst paragraph. Typed just now.`);
  });

  test("downloading saves a .md file named after the note", async ({ page, request }) => {
    const name = uniqueName("Markdown download");
    const note = await createNote(request, { name, content: "Downloaded body." });

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("button", { name: "More note actions" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download as Markdown" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(`${name.replace(/ /g, "-")}.md`);
    const text = await readFile(await download.path(), "utf8");
    expect(text).toContain(`title: "${name}"`);
    expect(text).toContain("Downloaded body.");
  });
});
