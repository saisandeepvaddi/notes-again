import { expect, test, type Page } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

const KEY = "sk-e2e-never-real";

function sse(events: unknown[]) {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

function context(note: { id: number; name: string; content: string }) {
  return {
    note_id: note.id,
    note_uid: `uid-${note.id}`,
    title: note.name,
    content: note.content,
    truncated: false,
    limit: 12000,
  };
}

async function mockDiscuss(
  page: Page,
  respond: (
    body: Record<string, unknown>,
    count: number,
  ) => { status?: number; body: string; delay?: number },
) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/notes/*/discuss", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const reply = respond(body, requests.length);
    if (reply.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay));
    await route.fulfill({
      status: reply.status ?? 200,
      contentType: reply.status && reply.status >= 400 ? "application/json" : "text/event-stream",
      body: reply.body,
    });
  });
  return requests;
}

async function openDiscuss(page: Page, noteId: number) {
  await page.goto(`/notes/${noteId}`);
  await page.getByRole("button", { name: "Discuss", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Discuss this note")).toBeVisible();
  return sheet;
}

async function configure(sheet: ReturnType<Page["getByRole"]>) {
  await sheet.getByLabel("Provider API key").fill(KEY);
  await sheet.getByRole("button", { name: "Save Discuss settings" }).click();
  await expect(sheet.getByLabel("Provider API key")).toHaveCount(0);
}

test.describe("discuss a note", () => {
  test("suggestion, streamed answer, disclosure and unchanged source", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, {
      name: uniqueName("Discuss"),
      content: "Mitochondria make ATP.",
    });
    const requests = await mockDiscuss(page, () => ({
      body: sse([
        { type: "context", context: context(note), provider: "openai", model: "gpt-4.1-mini" },
        { type: "delta", text: "ATP comes from " },
        { type: "delta", text: "**mitochondria** [1]. ![t](https://tracker.example/p.gif)" },
        { type: "usage", input_tokens: 12, output_tokens: 5 },
        { type: "done" },
      ]),
    }));
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    await sheet.getByRole("button", { name: "Explain" }).click();
    await expect(sheet.getByLabel("Your question")).toHaveValue(/Explain the key ideas/);
    await sheet.getByRole("button", { name: "Send to provider" }).click();

    await expect(sheet.locator("strong", { hasText: "mitochondria" })).toBeVisible();
    await expect(sheet.getByText("12 input · 5 output tokens")).toBeVisible();
    await expect(sheet.locator("img")).toHaveCount(0);
    await sheet.getByText(/Context sent/).click();
    await expect(sheet.locator("pre", { hasText: "Mitochondria make ATP." })).toBeVisible();
    await expect(sheet.getByRole("link", { name: /Source \[1\]/ })).toBeVisible();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ provider: "openai", api_key: KEY, history: [] });

    const after = await (await request.get(`${API_URL}/notes/${note.id}`)).json();
    expect(after.content).toBe(note.content);
    expect(after.reminders).toEqual(note.reminders);
  });

  test("keys never reach browser storage", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Keys") });
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    const stored = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    );
    expect(stored).not.toContain(KEY);
    await page.reload();
    const reopened = await openDiscuss(page, note.id);
    await expect(reopened.getByLabel("Provider API key")).toHaveValue("");
  });

  test("provider errors keep partial text and need an explicit retry", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, { name: uniqueName("Errors") });
    const requests = await mockDiscuss(page, (_body, count) => ({
      body:
        count === 1
          ? sse([
              { type: "context", context: context(note), provider: "openai", model: "m" },
              { type: "delta", text: "Half an answer" },
              { type: "error", message: "The provider interrupted this response." },
            ])
          : sse([{ type: "delta", text: "Whole answer" }, { type: "done" }]),
    }));
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    await sheet.getByLabel("Your question").fill("What is this?");
    await sheet.getByRole("button", { name: "Send to provider" }).click();
    await expect(sheet.getByText("Half an answer")).toBeVisible();
    await expect(sheet.getByText("Interrupted · partial answer")).toBeVisible();
    await expect(sheet.getByText("The provider interrupted this response.")).toBeVisible();
    await page.waitForTimeout(500);
    expect(requests).toHaveLength(1);

    await sheet.getByLabel("Your question").fill("Try again");
    await sheet.getByRole("button", { name: "Send to provider" }).click();
    await expect(sheet.getByText("Whole answer")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1].history).toEqual([]);
  });

  test("server rejections show their message", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Rejected") });
    await mockDiscuss(page, () => ({
      status: 502,
      body: JSON.stringify({ detail: "The provider rejected the API key." }),
    }));
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    await sheet.getByLabel("Your question").fill("Hi");
    await sheet.getByRole("button", { name: "Send to provider" }).click();
    await expect(sheet.getByText("The provider rejected the API key.")).toBeVisible();
    await sheet.getByLabel("Your question").fill("Hi again");
    await expect(sheet.getByRole("button", { name: "Send to provider" })).toBeEnabled();
  });

  test("stop ends the response without retrying", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Stop") });
    const requests = await mockDiscuss(page, () => ({
      delay: 4000,
      body: sse([{ type: "delta", text: "late" }, { type: "done" }]),
    }));
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    await sheet.getByLabel("Your question").fill("Slow one");
    await sheet.getByRole("button", { name: "Send to provider" }).click();
    await sheet.getByRole("button", { name: "Stop response" }).click();
    await expect(sheet.getByRole("button", { name: "Send to provider" })).toBeVisible();
    await expect(sheet.getByText("Stopped · partial answer")).toBeVisible();
    await expect(sheet.getByText("late")).toHaveCount(0);
    expect(requests).toHaveLength(1);
  });

  test("saving an answer needs confirmation and creates a separate note only", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, { name: uniqueName("Save"), content: "Source body" });
    await mockDiscuss(page, () => ({
      body: sse([
        { type: "context", context: context(note), provider: "openai", model: "m" },
        { type: "delta", text: "Saved answer text" },
        { type: "done" },
      ]),
    }));
    const sheet = await openDiscuss(page, note.id);
    await configure(sheet);
    await sheet.getByLabel("Your question").fill("Save me");
    await sheet.getByRole("button", { name: "Send to provider" }).click();
    await expect(sheet.getByText("Saved answer text")).toBeVisible();

    const countBefore = (
      await (
        await request.get(
          `${API_URL}/notes/list?status=note-only&search=${encodeURIComponent(`Discussion: ${note.name}`)}`,
        )
      ).json()
    ).items.length;
    await sheet.getByRole("button", { name: "Save answer as note" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    const afterCancel = (
      await (
        await request.get(
          `${API_URL}/notes/list?status=note-only&search=${encodeURIComponent(`Discussion: ${note.name}`)}`,
        )
      ).json()
    ).items.length;
    expect(afterCancel).toBe(countBefore);

    await sheet.getByRole("button", { name: "Save answer as note" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Create note" }).click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(
                `${API_URL}/notes/list?status=note-only&search=${encodeURIComponent(`Discussion: ${note.name}`)}`,
              )
            ).json()
          ).items.length,
      )
      .toBe(countBefore + 1);
    const saved = (
      await (
        await request.get(
          `${API_URL}/notes/list?status=note-only&search=${encodeURIComponent(`Discussion: ${note.name}`)}`,
        )
      ).json()
    ).items[0];
    expect(saved.reminders).toEqual([]);
    expect(saved.content).toContain(`source_note_uid: "uid-${note.id}"`);

    const source = await (await request.get(`${API_URL}/notes/${note.id}`)).json();
    expect(source.content).toBe("Source body");
    expect(source.reminders).toEqual(note.reminders);
  });
});
