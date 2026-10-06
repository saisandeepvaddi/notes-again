import { expect, test } from "@playwright/test";
import { API_URL, createNote, createProject, uniqueName } from "./support/api";

async function dueIds(request: import("@playwright/test").APIRequestContext) {
  const due = await (await request.get(`${API_URL}/notes/due?limit=200`)).json();
  return due.items.map((item: { id: number }) => item.id);
}

test.describe("note only", () => {
  test("a new note can be created as note only", async ({ page, request }) => {
    const noteName = uniqueName("Plain note");

    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(noteName);
    await page.getByRole("radio", { name: "Note only" }).click();
    await expect(page.getByText("A plain note with no reviews or due dates.")).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/notes$/);

    await page.goto("/notes?status=note-only");
    await expect(page.getByRole("link", { name: noteName, exact: true })).toBeVisible();
    const listed = await (
      await request.get(
        `${API_URL}/notes/list?status=note-only&search=${encodeURIComponent(noteName)}`,
      )
    ).json();
    expect(listed.items[0].reminders).toEqual([]);
  });

  test("converting a note between in review, note only and paused", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Convert me") });

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("radio", { name: "Note only" }).click();
    await expect(
      page.getByText("Note only: a plain note with no reviews or due dates."),
    ).toBeVisible();
    expect(await dueIds(request)).not.toContain(note.id);

    await page.getByRole("radio", { name: "Paused" }).click();
    await expect(page.getByText("Paused: kept out of review for now.")).toBeVisible();
    expect(await dueIds(request)).not.toContain(note.id);

    await page.getByRole("radio", { name: "In review" }).click();
    await expect(page.getByText("Paused: kept out of review for now.")).toBeHidden();
    expect(await dueIds(request)).toContain(note.id);
  });

  test("a project's notes can be made note only and added back from Organize", async ({
    page,
    request,
  }) => {
    const project = await createProject(request, uniqueName("Snippets"));
    await createNote(request, { name: uniqueName("Snippet"), project_id: project.id });

    await page.goto("/organize");
    const row = page.locator("li").filter({ hasText: project.name });
    await row
      .getByRole("button", { name: `Note only options for project ${project.name}` })
      .click();
    await page.getByRole("button", { name: "Make 1 note note only" }).click();
    await expect(row.getByText("1 note only")).toBeVisible();

    await row
      .getByRole("button", { name: `Note only options for project ${project.name}` })
      .click();
    await page.getByRole("button", { name: "Add to review", exact: true }).click();
    await expect(row.getByText("1 note only")).toBeHidden();
  });
});
