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

  test("pasting a web page or Markdown source keeps its structure", async ({ page, request }) => {
    const { note, editor } = await openEditor(page, "start", request);
    await page.keyboard.press("Enter");
    const paste = (type: string, value: string) =>
      editor
        .locator("[contenteditable=true]")
        .first()
        .evaluate(
          (element, [mime, data]) => {
            const transfer = new DataTransfer();
            transfer.setData(mime, data);
            element.dispatchEvent(
              new ClipboardEvent("paste", {
                clipboardData: transfer,
                bubbles: true,
                cancelable: true,
              }),
            );
          },
          [type, value],
        );
    await paste("text/html", "<h2>Pasted</h2><ul><li>one</li><li>two</li></ul>");
    await paste("text/plain", "# From source\n\n- a\n- b");
    await expect(editor.locator("h2").filter({ hasText: "Pasted" })).toBeVisible();
    await expect(editor.locator("h1").filter({ hasText: "From source" })).toBeVisible();
    await expect
      .poll(() => savedContent(request, note.id))
      .toMatch(/## Pasted[\s\S]*# From source/);
  });

  test("Cmd+F finds text inside the note and steps through matches", async ({ page, request }) => {
    const { editor } = await openEditor(page, "alpha beta\n\nbeta gamma beta", request);
    await page.keyboard.press("ControlOrMeta+f");
    const find = page.getByRole("textbox", { name: "Find in note" });
    await expect(find).toBeFocused();
    await find.fill("beta");
    await expect(page.getByRole("search")).toContainText("of 3");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(find).toHaveCount(0);
    await expect(editor).toContainText("gamma");
  });

  test("a failed save retries on its own and the contents list jumps to headings", async ({
    page,
    request,
  }) => {
    const { note } = await openEditor(page, "# One\n\ntext\n\n## Two\n\n## Three\n", request);
    await page.getByRole("button", { name: "Contents" }).click();
    await expect(page.getByRole("navigation", { name: "Note contents" })).toContainText("Three");
    await page.keyboard.press("Escape");

    let failing = true;
    await page.route(`**/api/notes/${note.id}`, (route) => {
      if (route.request().method() === "PATCH" && failing) return route.abort();
      return route.continue();
    });
    await page.locator(".mdxeditor-root-contenteditable").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" retried");
    await expect(page.getByRole("status").filter({ hasText: "Couldn't save" })).toBeVisible({
      timeout: 15_000,
    });
    failing = false;
    await expect
      .poll(() => savedContent(request, note.id), { timeout: 20_000 })
      .toContain("retried");
  });
});
