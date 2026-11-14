import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

const sse = (events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");

test.describe("library chat", () => {
  test("asks about the library, shows the passages sent and flags unverified citations", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, {
      name: uniqueName("Chat source"),
      content: "Mitochondria make ATP.",
    });
    const bodies: Record<string, unknown>[] = [];
    await page.route("**/api/chat", async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([
          {
            type: "sources",
            passages: [
              {
                n: 1,
                note_id: note.id,
                note_uid: "u1",
                title: note.name,
                text: "Mitochondria make ATP.",
              },
            ],
            provider: "openai",
            model: "gpt-4.1-mini",
          },
          { type: "delta", text: "ATP comes from mitochondria [1], and also [3]." },
          { type: "done" },
        ]),
      });
    });

    await page.goto("/chat");
    await page.getByLabel("Provider API key").fill("sk-e2e-never-real");
    await page.getByRole("button", { name: "Save Discuss settings" }).click();
    await page.getByLabel("Your question").fill("Where does ATP come from?");
    await page.getByRole("button", { name: "Send to provider" }).click();

    await expect(page.getByRole("link", { name: "[1]", exact: true }).first()).toBeVisible();
    await expect(page.getByText("[3] did not match any passage that was sent")).toBeVisible();
    await expect(page.getByText("Passages sent · 1")).toBeVisible();
    await expect(page.getByText("Mitochondria make ATP.").first()).toBeVisible();
    expect(bodies[0]).toMatchObject({
      scope: { kind: "library" },
      api_key: "sk-e2e-never-real",
      question: "Where does ATP come from?",
    });

    const after = await (await request.get(`${API_URL}/notes/${note.id}`)).json();
    expect(after.content).toBe(note.content);
  });

  test("a project scope must be chosen before sending", async ({ page }) => {
    await page.goto("/chat");
    await page.getByLabel("Provider API key").fill("sk-e2e-never-real");
    await page.getByRole("button", { name: "Save Discuss settings" }).click();
    await page.getByLabel("Ask about").selectOption("project");
    await page.getByLabel("Your question").fill("Anything?");
    await expect(page.getByRole("button", { name: "Send to provider" })).toBeDisabled();
  });
});
