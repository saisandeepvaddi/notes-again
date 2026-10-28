import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "../src/lib/saveFile";

describe("filenameFromDisposition", () => {
  it("prefers the UTF-8 name over the ASCII fallback", () => {
    expect(
      filenameFromDisposition(
        `attachment; filename="Caf-Notes.md"; filename*=UTF-8''Caf%C3%A9-Notes.md`,
      ),
    ).toBe("Café-Notes.md");
  });

  it.each([
    [`attachment; filename="notes-again-2026-10-27.json"`, "notes-again-2026-10-27.json"],
    ["attachment; filename=backup.db", "backup.db"],
    [`attachment; filename="plain.md"; filename*=UTF-8''%E0%A4%A`, "plain.md"],
  ])("reads %j", (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });

  it.each([[null], [""], ["inline"]])("returns null without a filename (%j)", (header) => {
    expect(filenameFromDisposition(header)).toBeNull();
  });
});
