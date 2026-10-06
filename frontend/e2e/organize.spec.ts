import { expect, test, type Page } from "@playwright/test";
import { createNote, createProject, createTag, uniqueName } from "./support/api";

const chip = (page: Page, text: string) =>
  page.locator('[data-slot="badge"]').filter({ hasText: text });

test.describe("projects and tags", () => {
  test("creating a project and tag from the new-note form shows up in Organize", async ({
    page,
  }) => {
    const noteName = uniqueName("Organize note");
    const projectName = uniqueName("Project");
    const tagName = uniqueName("tag");

    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(noteName);
    await page.getByRole("textbox", { name: "editable markdown" }).click();
    await page.keyboard.type("Content for the organize test.");

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByPlaceholder("Search or create project...").fill(projectName);
    await page.getByRole("option", { name: `Create "${projectName}"` }).click();
    await expect(chip(page, projectName)).toBeVisible();

    await page.getByRole("button", { name: "Tag", exact: true }).click();
    await page.getByPlaceholder("Search or create tag...").fill(tagName);
    await page.getByRole("option", { name: `Create "${tagName}"` }).click();
    await expect(chip(page, tagName)).toBeVisible();

    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/notes$/);

    await page.goto("/organize");
    const projectRow = page.locator("li").filter({ hasText: projectName });
    await expect(projectRow.getByText("1 note", { exact: true })).toBeVisible();
    const tagRow = page.locator("li").filter({ hasText: tagName });
    await expect(tagRow.getByText("1 note", { exact: true })).toBeVisible();

    await projectRow.getByText("1 note", { exact: true }).click();
    await expect(page).toHaveURL(/\/notes\?.*projectId=/);
    await expect(page.getByRole("link", { name: noteName, exact: true })).toBeVisible();
  });

  test("attaching a tag and a project from the note detail page persists", async ({
    page,
    request,
  }) => {
    const note = await createNote(request, { name: uniqueName("Detail-edit note") });
    const projectName = uniqueName("Detail project");
    const tagName = uniqueName("detail-tag");

    await page.goto(`/notes/${note.id}`);

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByPlaceholder("Search or create project...").fill(projectName);
    await page.getByRole("option", { name: `Create "${projectName}"` }).click();
    await expect(chip(page, projectName)).toBeVisible();

    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByPlaceholder("Search or create tag...").fill(tagName);
    await page.getByRole("option", { name: `Create "${tagName}"` }).click();
    await expect(chip(page, tagName)).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByText("medium", { exact: true }).click();
    await page.getByRole("button", { name: "Hard", exact: true }).click();
    await expect(page.getByText("hard", { exact: true })).toBeVisible();

    await page.reload();
    await expect(chip(page, projectName)).toBeVisible();
    await expect(chip(page, tagName)).toBeVisible();
    await expect(page.getByText("hard", { exact: true })).toBeVisible();
  });

  test("deleting unused tags removes them from Organize", async ({ page, request }) => {
    const tagName = uniqueName("orphan-tag");
    await createTag(request, tagName);

    await page.goto("/organize");
    const deleteButton = page.getByRole("button", { name: /Delete \d+ unused/ });
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(tagName)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete unused tags" }).click();

    await expect(page.locator("li").filter({ hasText: tagName })).toHaveCount(0);
  });

  test("deleting a project with its notes moves them to Trash", async ({ page, request }) => {
    const project = await createProject(request, uniqueName("Doomed project"));
    const note = await createNote(request, {
      name: uniqueName("Note in doomed project"),
      project_id: project.id,
    });

    await page.goto("/organize");
    const projectRow = page.locator("li").filter({ hasText: project.name });
    await projectRow.getByRole("button", { name: `Delete project ${project.name}` }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("checkbox", { name: /Also delete its 1 note/ }).click();
    await dialog.getByRole("button", { name: /Delete project & 1 note/ }).click();

    await expect(page.locator("li").filter({ hasText: project.name })).toHaveCount(0);

    await page.goto("/trash");
    await expect(page.getByRole("heading", { name: note.name, exact: true })).toBeVisible();
  });
});
