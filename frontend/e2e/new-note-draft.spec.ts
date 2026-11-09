import { expect, test } from "@playwright/test";
import { createProject, createTag, uniqueName } from "./support/api";

test.describe("new-note writing safety", () => {
  test("restores writing and settings after navigation and reload, then clears after creation", async ({
    page,
    request,
  }) => {
    const name = uniqueName("Recovered draft");
    const project = await createProject(request, uniqueName("Draft project"));
    const tag = await createTag(request, uniqueName("Draft tag"));
    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("textbox", { name: "editable markdown" }).fill("A draft worth keeping.");
    await page.getByRole("button", { name: "Hard", exact: true }).click();
    await page.getByRole("radio", { name: "Note only", exact: true }).click();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByRole("option", { name: project.name, exact: true }).click();
    await page.getByRole("button", { name: "Tag", exact: true }).click();
    await page.getByRole("option", { name: tag.name, exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("radio", { name: "Note only", exact: true }).click();
    await page.getByRole("link", { name: "All Notes", exact: true }).click();
    await page.goto("/notes/new");
    await expect(page.getByText("Draft restored. Saved in this browser only.")).toBeVisible();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toContainText(
      "A draft worth keeping.",
    );
    await expect(page.getByRole("button", { name: "Hard", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("main").getByText(project.name, { exact: true })).toBeVisible();
    await expect(page.locator("main").getByText(tag.name, { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Note only", exact: true })).toBeChecked();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await page.goto("/notes/new");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toBeEmpty();
  });

  test("failed creation explains the error and retries without losing writing", async ({
    page,
  }) => {
    const name = uniqueName("Retry draft");
    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page
      .getByRole("textbox", { name: "editable markdown" })
      .fill("Keep this when saving fails.");
    await page.route("**/api/notes/create", (route) =>
      route.fulfill({ status: 500, json: { detail: "Temporary save failure" } }),
    );
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn’t create the note");
    await expect(page.getByRole("alert")).toContainText("Temporary save failure");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toContainText(
      "Keep this when saving fails.",
    );
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await page.unroute("**/api/notes/create");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("discard requires confirmation and clears the editor and stored draft", async ({ page }) => {
    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill("Discard this draft");
    await page.getByRole("textbox", { name: "editable markdown" }).fill("Discard the body too.");
    await page.getByRole("button", { name: "Discard draft", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep writing" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Discard this draft");
    await page.getByRole("button", { name: "Discard draft", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Discard draft", exact: true })
      .click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "editable markdown" })).toBeEmpty();
    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Discard draft", exact: true })).toHaveCount(0);
  });

  test("unavailable storage warns and protects navigation while allowing creation", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Storage full", "QuotaExceededError");
      };
    });
    await page.goto("/notes/new");
    const name = uniqueName("Unstored draft");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await expect(
      page.getByRole("status").filter({ hasText: "Draft couldn’t be saved" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "All Notes", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Leave without saving this draft?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Keep writing" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("the user can explicitly leave when a draft cannot be stored", async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      };
    });
    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill("An unstored draft");
    await page.getByRole("link", { name: "All Notes", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Leave anyway" }).click();
    await expect(page).toHaveURL(/\/notes$/);
  });

  test("a pending creation prevents edits and finishes before navigating away", async ({
    page,
  }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/notes/create", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/notes/new");
    await page.getByLabel("Name", { exact: true }).fill(uniqueName("Slow creation"));
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("button", { name: "Creating", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
    await page.getByRole("link", { name: "All Notes", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/new$/);
    release();
    await expect(page).toHaveURL(/\/notes$/);
    await page.goto("/notes/new");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
  });
});
