import { describe, expect, it } from "vitest";
import { noteLinkMarkdown, noteLinkUid } from "../src/links/uri";

const uid = "b".repeat(32);

describe("note links", () => {
  it("recognises only well-formed note uids", () => {
    expect(noteLinkUid(`note:${uid}`)).toBe(uid);
    for (const bad of ["note:abc", `note:${uid}/x`, `attachment:${uid}`, "https://x.test"]) {
      expect(noteLinkUid(bad)).toBeNull();
    }
  });

  it("builds a link whose label cannot break the Markdown", () => {
    expect(noteLinkMarkdown("A [odd]\ntitle", uid)).toBe(`[A odd title](note:${uid})`);
    expect(noteLinkMarkdown("  ", uid)).toBe(`[Untitled](note:${uid})`);
  });
});
