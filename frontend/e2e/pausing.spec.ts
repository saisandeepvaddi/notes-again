import { expect, test } from "@playwright/test";
import { API_URL, createNote, createProject, uniqueName } from "./support/api";

test.describe("pausing", () => {
  test("pausing and resuming a project from Organize", async ({ page, request }) => {
    const project = await createProject(request, uniqueName("Pause project"));
    await createNote(request, { name: uniqueName("Paused note"), project_id: project.id });

    await page.goto("/organize");
    const row = page.locator("li").filter({ hasText: project.name });
    await row.getByRole("button", { name: `Pause project ${project.name}` }).click();
    await expect(row.getByText("Paused", { exact: true })).toBeVisible();
    await expect(row.getByText("1 paused")).toBeVisible();

    await row.getByRole("button", { name: `Resume project ${project.name}` }).click();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(row.getByText("1 paused")).toBeHidden();
    await expect(row.getByText("Paused", { exact: true })).toBeHidden();
  });

  test("a note in a paused project starts paused, with the reason shown", async ({
    page,
    request,
  }) => {
    const project = await createProject(request, uniqueName("Reference"));
    await request.post(`${API_URL}/projects/${project.id}/pause`);
    const noteName = uniqueName("Reference note");

    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(noteName);
    const paused = page.getByRole("radio", { name: "Paused" });
    await expect(paused).toHaveAttribute("aria-checked", "false");

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByPlaceholder("Search or create project...").fill(project.name);
    await page.getByRole("option", { name: project.name, exact: true }).click();
    await expect(paused).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(`Paused because “${project.name}” is paused`)).toBeVisible();

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/notes$/);

    await page.goto("/notes?status=paused");
    await expect(page.getByRole("link", { name: noteName, exact: true })).toBeVisible();
  });

  test("pausing a note from its page keeps it out of review", async ({ page, request }) => {
    const note = await createNote(request, { name: uniqueName("Pause me") });

    await page.goto(`/notes/${note.id}`);
    await page.getByRole("radio", { name: "Paused" }).click();
    await expect(page.getByText("Paused: kept out of review for now.")).toBeVisible();

    const due = await (await request.get(`${API_URL}/notes/due?limit=200`)).json();
    expect(due.items.map((item: { id: number }) => item.id)).not.toContain(note.id);

    await page.getByRole("radio", { name: "In review" }).click();
    await expect(page.getByText("Paused: kept out of review for now.")).toBeHidden();
  });
});
