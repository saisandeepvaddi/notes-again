import { describe, expect, it } from "vitest";
import { attachmentMarkdown, attachmentUid, checkAttachmentFile } from "../src/attachments/uri";

const uid = "a".repeat(32);

describe("attachment links", () => {
  it("recognises only well-formed attachment uids", () => {
    expect(attachmentUid(`attachment:${uid}`)).toBe(uid);
    expect(attachmentUid(` attachment:${uid} `)).toBe(uid);
    for (const bad of [
      "attachment:abc",
      `attachment:${uid}/x`,
      `https://a.b/${uid}`,
      `javascript:${uid}`,
      "",
    ]) {
      expect(attachmentUid(bad)).toBeNull();
    }
  });

  it("builds image and file links with safe labels", () => {
    expect(attachmentMarkdown({ uid, name: "pic [1].png", mime: "image/png" })).toBe(
      `![pic  1 .png](attachment:${uid})`,
    );
    expect(attachmentMarkdown({ uid, name: "a\nb.pdf", mime: "application/pdf" })).toBe(
      `[a b.pdf](attachment:${uid})`,
    );
    expect(attachmentMarkdown({ uid, name: " ", mime: "image/gif" })).toBe(
      `![attachment](attachment:${uid})`,
    );
  });

  it("enforces type and size limits before uploading", () => {
    expect(checkAttachmentFile({ size: 1, type: "image/png" })).toBeNull();
    expect(checkAttachmentFile({ size: 25 * 1024 * 1024, type: "application/pdf" })).toBeNull();
    expect(checkAttachmentFile({ size: 25 * 1024 * 1024 + 1, type: "application/pdf" })).toMatch(
      /25 MB/,
    );
    expect(checkAttachmentFile({ size: 10 * 1024 * 1024 + 1, type: "image/jpeg" })).toMatch(
      /10 MB/,
    );
    expect(checkAttachmentFile({ size: 1, type: "image/svg+xml" })).toMatch(/Only PNG/);
  });
});
