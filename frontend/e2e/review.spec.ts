import { expect, test } from "@playwright/test";
import { API_URL, createNote, uniqueName } from "./support/api";

test.describe("review session", () => {
  test("rating a due note's reminder marks it reviewed and reschedules it", async ({
    page,
    request,
  }) => {
    // An ancient first_reminder_at sorts before anything any other spec
    // could have created, so this note is deterministically first in the
    // due queue regardless of what else is due in the shared database.
    const note = await createNote(request, {
      name: uniqueName("Due note"),
      content: "Recall me please.",
      first_reminder_at: "1970-01-01T00:00:00Z",
    });

    await page.goto("/review");
    await expect(page.getByText(note.name, { exact: true })).toBeVisible();
    await expect(page.getByText("Recall me please.")).toBeVisible();

    await page.getByRole("button", { name: "Good" }).click();

    // The card moves on to whatever's next due (or the empty state) -- what
    // matters is that this note's own reminder was actually recorded.
    await expect(page.getByText(note.name, { exact: true })).toHaveCount(0);

    const response = await request.get(`${API_URL}/notes/${note.id}`);
    const updated = await response.json();
    const reviewed = updated.reminders.filter(
      (r: { reviewed_at: string | null }) => r.reviewed_at !== null,
    );
    const pending = updated.reminders.filter(
      (r: { reviewed_at: string | null }) => r.reviewed_at === null,
    );
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0].rating).toBe("good");
    expect(pending).toHaveLength(1);
    expect(new Date(pending[0].remind_at).getTime()).toBeGreaterThan(Date.now());
  });

  test("a note not yet due does not appear in the review queue", async ({ page, request }) => {
    const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    const note = await createNote(request, {
      name: uniqueName("Not-yet-due note"),
      first_reminder_at: farFuture,
    });

    await page.goto("/review");
    await expect(page.getByText(note.name, { exact: true })).toHaveCount(0);
  });
});
