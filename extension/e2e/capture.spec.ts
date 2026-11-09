/// <reference types="chrome" />
import { createServer } from "node:http";
import path from "node:path";
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

interface Saved {
  name: string;
  content: string;
  in_review?: boolean;
}
interface CaptureHarness {
  page: Page;
  worker: Worker;
  baseUrl: string;
  saved: Saved[];
  open: (mode?: "page" | "selection") => Promise<void>;
}

const prose =
  "Writing a note should preserve useful ideas without demanding perfect organization. A readable article gives those ideas a stable home, and keeps the important details available when the original page changes. ".repeat(
    5,
  );
const article = `<html><head><title>Keeping useful ideas</title><meta name="author" content="Jane Writer"></head><body><nav>Example Journal</nav><article><h1>Keeping useful ideas</h1><p>${prose}</p><h2>A practical example</h2><p><a href="/reference">Read the reference</a> before trying the example.</p><pre><code class="language-js">const idea = "Keep this";\n  remember(idea);</code></pre><table><tr><th>Mode</th><th>Result</th></tr><tr><td>Article</td><td>Offline text</td></tr></table></article></body></html>`;

const test = base.extend<{ capture: CaptureHarness }>({
  capture: async ({ browserName }, use) => {
    if (browserName !== "chromium") throw new Error("Extension checks require Chromium");
    const saved: Saved[] = [];
    const server = createServer(async (request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url?.endsWith("/list")) return response.end("[]");
      if (request.url === "/api/notes/create") {
        const parts: Buffer[] = [];
        for await (const chunk of request) parts.push(Buffer.from(chunk));
        const note = JSON.parse(Buffer.concat(parts).toString()) as Saved;
        saved.push(note);
        return response.end(JSON.stringify({ id: saved.length, name: note.name }));
      }
      response.setHeader("Content-Type", "text/html");
      response.end(article);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const extension = path.resolve("dist/chrome-mv3");
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        headless: true,
        viewport: { width: 1366, height: 900 },
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      await worker.evaluate(async (url) => {
        await chrome.storage.local.set({
          settings: { serverUrl: url, apiToken: "", lastNoteOnly: false },
        });
      }, baseUrl);
      const page = await context.newPage();
      await page.goto(`${baseUrl}/article`);
      const open = async (mode: "page" | "selection" = "page") => {
        await worker.evaluate(
          async ({ url, mode }) => {
            const [tab] = await chrome.tabs.query({ url: `${url}/*` });
            if (!tab?.id) throw new Error("Test article tab not found");
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ["/capture.js"],
            });
            await chrome.tabs.sendMessage(tab.id, {
              type: "open-dialog",
              mode,
              selectionText: mode === "selection" ? "A selected observation" : undefined,
            });
          },
          { url: baseUrl, mode },
        );
        await expect(page.getByRole("dialog")).toBeVisible();
      };
      await use({ page, worker, baseUrl, saved, open });
    } finally {
      try {
        await context?.close();
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  },
});

test("built extension extracts, edits and saves article text; repeat capture warns and link-only stays available", async ({
  capture,
}, testInfo) => {
  const { page, saved, open, baseUrl } = capture;
  await open();
  await page.getByLabel("Capture", { exact: true }).selectOption("article");
  const preview = page.getByLabel("Markdown preview · editable");
  await expect(preview).toHaveValue(/## A practical example/);
  await expect(preview).toHaveValue(/```js\nconst idea/);
  await expect(preview).toHaveValue(/\| Mode \| Result \|/);
  await expect(page.getByLabel("Note only")).toBeChecked();
  await preview.fill(`${await preview.inputValue()}\n\nMy observation.`);
  await page.screenshot({ path: testInfo.outputPath("article-desktop.png") });
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Saved “Keeping useful ideas”")).toBeVisible();
  expect(saved[0]).toMatchObject({
    in_review: false,
    content: expect.stringContaining("My observation."),
  });
  expect(saved[0]?.content).toContain('source_author: "Jane Writer"');
  expect(saved[0]?.content).toContain(`[Read the reference](${baseUrl}/reference)`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await open();
  await expect(page.getByText(/This URL was saved from this browser before/)).toBeVisible();
  await expect(preview).not.toHaveValue(/Writing a note should/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("duplicate-narrow-dark.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Saved “Keeping useful ideas”")).toBeVisible();
  expect(saved).toHaveLength(2);
  expect(saved[1]?.content).not.toContain("Writing a note should");
});

test("selection capture remains editable", async ({ capture }) => {
  const { page, open, saved } = capture;
  await open("selection");
  await expect(page.getByLabel("Capture", { exact: true })).toHaveValue("selection");
  await expect(page.getByLabel("Markdown preview · editable")).toHaveValue(
    /A selected observation/,
  );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText(/Saved “/)).toBeVisible();
  expect(saved[0]?.content).toContain("A selected observation");
  expect(saved[0]?.content).not.toContain("Writing a note should");
});

test("restricted-page popup explains fallback without losing selection", async ({
  capture,
}, testInfo) => {
  const { page, worker } = capture;
  await worker.evaluate(async () => {
    await chrome.storage.session.set({
      "pending:restricted": {
        mode: "selection",
        url: "chrome://extensions/",
        title: "Extensions",
        selection: "Selected fallback text",
      },
    });
  });
  const id = new URL(worker.url()).host;
  await page.goto(`chrome-extension://${id}/capture-window.html?id=restricted`);
  await expect(page.getByText(/does not allow article extraction/)).toBeVisible();
  await expect(page.getByRole("option", { name: "Readable article" })).toBeDisabled();
  await expect(page.getByLabel("Markdown preview · editable")).toHaveValue(
    /Selected fallback text/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("restricted-popup.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
