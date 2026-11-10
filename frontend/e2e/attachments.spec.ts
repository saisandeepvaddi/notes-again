import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("attachments", () => {
  test("attaching an image and a PDF stores them and shows the image after reload", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, { name: uniqueName("Attach"), content: "Body" });
    await page.goto(`/notes/${note.id}`);
    const input = page.getByLabel("Attach a file");

    await input.setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("button", { name: "Attach", exact: true })).toBeEnabled();
    await input.setInputFiles({
      name: "paper.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e"),
    });

    await expect
      .poll(async () => (await (await request.get(`${API_URL}/notes/${note.id}`)).json()).content)
      .toMatch(
        /!\[dot\.png\]\(attachment:[a-f0-9]{32}\)[\s\S]*\[paper\.pdf\]\(attachment:[a-f0-9]{32}\)/,
      );
    const listed = await (await request.get(`${API_URL}/notes/${note.id}/attachments`)).json();
    expect(listed.map((item: { mime: string }) => item.mime)).toEqual([
      "image/png",
      "application/pdf",
    ]);

    await page.reload();
    const image = page.locator('img[alt="dot.png"]');
    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("src", /^blob:/);
  });

  test("unsupported files are refused with a message", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Refuse") });
    await page.goto(`/notes/${note.id}`);
    await page.getByLabel("Attach a file").setInputFiles({
      name: "x.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(
      page.getByText("Only PNG, JPEG, WebP, GIF and PDF files can be attached."),
    ).toBeVisible();
    const listed = await (await request.get(`${API_URL}/notes/${note.id}/attachments`)).json();
    expect(listed).toEqual([]);
  });
});
