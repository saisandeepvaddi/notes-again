import { expect, test } from "@playwright/test";
import { createNote, uniqueName } from "./support/api";

const CONTENT = `# Rich note

Inline math $e^{i\\pi}+1=0$ and a block:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

> [!NOTE]
> Callouts work.

- [x] Shipped
- [ ] Pending

\`\`\`mermaid
graph TD
  A[Start] --> B{Ok?}
  B -->|yes| C[Done]
\`\`\`

\`\`\`ts
const answer: number = 42;
\`\`\`

| a | b |
|---|---|
| 1 | 2 |

Footnote[^1] and ==highlight==.

[^1]: The footnote.

<details><summary>More</summary>

Hidden **text**

</details>

![clip](https://example.test/clip.mp4)

![talk](https://youtu.be/dQw4w9WgXcQ)
`;

test("notes the visual editor cannot open still show every construct in the preview", async ({
  page,
  request,
}) => {
  const note = await createNote(request, { name: uniqueName("Rich"), content: CONTENT });
  await page.goto(`/notes/${note.id}`);
  await expect(page.getByText("shown as source")).toBeVisible();
  const body = page.locator(".markdown-content").first();
  await expect(body.locator(".katex-display")).toBeVisible();
  await expect(body.locator(".mermaid-block[data-rendered='true'] svg")).toBeVisible();
  await expect(body.locator(".markdown-alert")).toContainText("Callouts work");
  await expect(body.locator('input[type="checkbox"]')).toHaveCount(2);
  await expect(body.locator("pre.shiki")).toBeVisible();
  await expect(body.locator("details")).toBeVisible();
  await expect(body.locator("video")).toHaveCount(1);
  await expect(body.locator("iframe")).toHaveAttribute("src", /youtube-nocookie/);
  await expect(body.locator("mark")).toHaveText("highlight");
  await page.screenshot({
    path: process.env.MD_SHOT ?? "test-results/markdown.png",
    fullPage: true,
  });
});

test("the editor shows math and diagrams and keeps their source intact", async ({
  page,
  request,
}) => {
  const content =
    "Inline $a_b + c_d$ here.\n\n$$\n\\int_0^1 x_i\\,dx\n$$\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nA note[^1].\n\n[^1]: Detail.\n";
  const note = await createNote(request, { name: uniqueName("Math"), content });
  await page.goto(`/notes/${note.id}`);
  const editor = page.locator(".mdxeditor-root-contenteditable");
  await expect(editor.locator(".katex").first()).toBeVisible();
  await expect(editor.locator(".mermaid-block[data-rendered='true'] svg")).toBeVisible();
  await editor.getByText("here.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Added.");
  await expect
    .poll(
      async () =>
        (await (await request.get(`http://127.0.0.1:8210/api/notes/${note.id}`)).json()).content,
    )
    .toContain("Added.");
  const saved = (await (await request.get(`http://127.0.0.1:8210/api/notes/${note.id}`)).json())
    .content;
  expect(saved).toContain("$a_b + c_d$");
  expect(saved).toContain("x_i");
  expect(saved).toContain("graph TD");
  expect(saved).toContain("[^1]: Detail.");
  expect(saved).not.toContain("\\_");
});
