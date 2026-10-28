import { expect, type Page } from "@playwright/test";

export async function openFilteredNotes(page: Page, query: string, expectedCount: number) {
  await page.goto(`/notes?q=${encodeURIComponent(query)}`);
  if (expectedCount === 0) {
    await expect(page.getByRole("heading", { name: "No notes match" })).toBeVisible();
    return;
  }
  const label = `${expectedCount} note${expectedCount === 1 ? "" : "s"}`;
  await expect(page.getByText(label, { exact: true })).toBeVisible();
}
