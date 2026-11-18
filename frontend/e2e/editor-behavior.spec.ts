import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

async function openEditor(
  page: import("@playwright/test").Page,
  content: string,
  request: import("@playwright/test").APIRequestContext,
) {
  const note = await createNote(request, { name: uniqueName("Editor"), content });
  await page.goto(`/notes/${note.id}`);
  const editor = page.locator(".mdxeditor-root-contenteditable");
  await editor.click();
  await page.keyboard.press("Control+End");
  return { note, editor };
}

const savedContent = async (request: import("@playwright/test").APIRequestContext, id: number) =>
  (await (await request.get(`${API_URL}/notes/${id}`)).json()).content as string;

test.describe("editor behaviour", () => {
  test("typing a fence with a language starts a code block in that language and focuses it", async ({
    page,
    request,
  }) => {
    const { note } = await openEditor(page, "start", request);
    await page.keyboard.press("Enter");
    await page.keyboard.type("```ts", { delay: 30 });
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-editor .cm-content")).toBeFocused();
    await page.keyboard.type("const a = 1;", { delay: 20 });
    await expect.poll(() => savedContent(request, note.id)).toMatch(/```ts\nconst a = 1;\n```/);
  });

  test("the language list offers far more than a handful of languages", async ({
    page,
    request,
  }) => {
    await openEditor(page, "```go\nfmt.Println()\n```\n", request);
    await page.getByRole("combobox", { name: /language/i }).click();
    expect(await page.getByRole("option").count()).toBeGreaterThan(60);
  });

  test("undo steps back through a phrase, then the quote, instead of one character at a time", async ({
    page,
    request,
  }) => {
    const { editor } = await openEditor(page, "start", request);
    await page.keyboard.press("Enter");
    await page.keyboard.type("> quoted text here", { delay: 40 });
    await expect(editor.locator("blockquote")).toContainText("quoted text here");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor.locator("blockquote")).toHaveCount(0);
    await expect(editor).not.toContainText("quoted text here");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(editor.locator("blockquote")).toContainText("quoted text here");
  });

  test("Source and Read views edit and show notes the visual editor cannot open", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, {
      name: uniqueName("Html"),
      content: "<details><summary>More</summary>\n\nHidden text\n\n</details>\n",
    });
    await page.goto(`/notes/${note.id}`);
    const view = page.getByRole("radiogroup", { name: "Note view" });
    await view.getByRole("radio", { name: "Read" }).click();
    await expect(page.locator(".markdown-content details")).toBeVisible();
    await view.getByRole("radio", { name: "Source" }).click();
    const source = page.getByRole("textbox", { name: "Note source" });
    await source.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type("\nAdded in source");
    await expect.poll(() => savedContent(request, note.id)).toContain("Added in source");
    expect(await savedContent(request, note.id)).toContain("<details>");
    await view.getByRole("radio", { name: "Edit" }).click();
    await expect(page.getByRole("radio", { name: "Edit" })).toBeChecked();
  });
});
