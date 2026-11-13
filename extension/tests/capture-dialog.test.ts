// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureContext } from "../lib/capture/types";

const background = vi.hoisted(() => vi.fn());
vi.mock("../lib/messaging", () => ({ callBackground: background }));
import { CaptureDialog } from "../lib/ui/CaptureDialog";

const ctx: CaptureContext = {
  mode: "page",
  title: "Page title",
  url: "https://example.com/article",
  capturedAt: "2026-11-09T12:00:00Z",
  selection: "Selected passage",
  article: {
    ok: true,
    article: { title: "Article title", media: [], markdown: "## A heading\n\nReadable article body." },
  },
};
const defaults = { projects: [], tags: [], lastProject: "", lastNoteOnly: false };

function open(context = ctx) {
  const onClose = vi.fn();
  render(createElement(CaptureDialog, { ctx: context, variant: "window", onClose }));
  return { user: userEvent.setup(), onClose };
}

beforeEach(() => {
  background.mockReset();
  background.mockImplementation(async (request) =>
    request.type === "lookups"
      ? defaults
      : request.type === "previous-capture"
        ? null
        : { id: 1, name: "Saved note", openUrl: "https://notes.test/notes/1" },
  );
});
afterEach(cleanup);

describe("capture dialog", () => {
  it("offers all modes, keeps edits per mode, and saves the edited article as Note only", async () => {
    const { user } = open();
    await screen.findByLabelText("Capture");
    const preview = screen.getByLabelText("Markdown preview · editable") as HTMLTextAreaElement;
    expect(preview.value).not.toContain("Readable article body");
    await user.selectOptions(screen.getByLabelText("Capture"), "article");
    expect(preview.value).toContain("Readable article body");
    expect((screen.getByLabelText(/Note only/) as HTMLInputElement).checked).toBe(true);
    await user.type(preview, " My annotation.");
    await user.selectOptions(screen.getByLabelText("Capture"), "selection");
    expect(preview.value).toContain("Selected passage");
    await user.selectOptions(screen.getByLabelText("Capture"), "article");
    expect(preview.value).toContain("My annotation.");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText(/Saved “Saved note”/);
    expect(background).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "save",
        draft: expect.objectContaining({
          noteOnly: true,
          sourceUrl: ctx.url,
          content: expect.stringContaining("My annotation."),
        }),
      }),
    );
  });

  it("preserves selection capture and explains restricted-page fallback", async () => {
    open({
      ...ctx,
      mode: "selection",
      article: {
        ok: false,
        reason: "This browser page does not allow article extraction. Use Link only.",
      },
    });
    expect((screen.getByLabelText("Capture") as HTMLSelectElement).value).toBe("selection");
    expect(
      (screen.getByLabelText("Markdown preview · editable") as HTMLTextAreaElement).value,
    ).toContain("Selected passage");
    expect(
      (screen.getByRole("option", { name: "Readable article" }) as HTMLOptionElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/does not allow article extraction/)).toBeTruthy();
  });

  it("does not overwrite explicit project or review choices when defaults arrive late", async () => {
    let resolve!: (value: typeof defaults) => void;
    background.mockImplementation((request) =>
      request.type === "lookups"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(null),
    );
    const { user } = open();
    await user.selectOptions(screen.getByLabelText("Capture"), "article");
    const checkbox = screen.getByLabelText(/Note only/) as HTMLInputElement;
    await user.click(checkbox);
    const project = screen.getByRole("combobox", { name: "Project" });
    await user.type(project, "My project");
    await user.keyboard("{Enter}");
    await act(async () =>
      resolve({ ...defaults, lastNoteOnly: true, lastProject: "Remembered project" }),
    );
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText("My project")).toBeTruthy();
    expect(screen.queryByText("Remembered project")).toBeNull();
  });

  it("keeps the article Note only default when preferences arrive late", async () => {
    let resolve!: (value: typeof defaults) => void;
    background.mockImplementation((request) =>
      request.type === "lookups"
        ? new Promise((done) => {
            resolve = done;
          })
        : Promise.resolve(null),
    );
    const { user } = open();
    await user.selectOptions(screen.getByLabelText("Capture"), "article");
    await act(async () => resolve(defaults));
    expect((screen.getByLabelText(/Note only/) as HTMLInputElement).checked).toBe(true);
  });

  it("warns about recent duplicates without blocking a separate capture", async () => {
    background.mockImplementation(async (request) =>
      request.type === "lookups" ? defaults : "2026-11-09T12:00:00Z",
    );
    open();
    await screen.findByText(/This URL was saved from this browser before/);
    expect(screen.getByRole("button", { name: "Save note" }).hasAttribute("disabled")).toBe(false);
  });

  it("does not create another note from keyboard shortcuts on the saved screen", async () => {
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText(/Saved “Saved note”/);
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(background.mock.calls.filter(([request]) => request.type === "save")).toHaveLength(1);
  });

  it("allows saving when the recent-capture check fails", async () => {
    background.mockImplementation(async (request) => {
      if (request.type === "lookups") return defaults;
      if (request.type === "previous-capture") throw new Error("Storage unavailable");
      return { id: 1, name: "Saved note", openUrl: "https://notes.test/notes/1" };
    });
    const { user } = open();
    await screen.findByText(/Recent-capture check unavailable/);
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText(/Saved “Saved note”/);
  });

  it("keeps the draft editable after a save failure and allows retry", async () => {
    let saves = 0;
    background.mockImplementation(async (request) => {
      if (request.type === "lookups") return defaults;
      if (request.type === "previous-capture") return null;
      if (++saves === 1) throw new Error("Server unavailable");
      return { id: 1, name: "Retry", openUrl: "https://notes.test/notes/1" };
    });
    const { user } = open();
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText("Server unavailable");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await screen.findByText(/Saved “Retry”/);
    await waitFor(() => expect(saves).toBe(2));
  });
});
