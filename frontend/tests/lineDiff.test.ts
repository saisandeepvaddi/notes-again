import { describe, expect, it } from "vitest";
import { hasChanges, lineDiff } from "../src/revisions/lineDiff";

describe("lineDiff", () => {
  it("marks identical text as unchanged", () => {
    expect(hasChanges(lineDiff("a\nb", "a\nb"))).toBe(false);
  });

  it("reports removed and added lines in order", () => {
    expect(lineDiff("a\nb\nc", "a\nx\nc")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("handles empty sides and trailing additions", () => {
    expect(lineDiff("", "a").map((l) => l.kind)).toEqual(["removed", "added"]);
    expect(lineDiff("a", "a\nb").map((l) => l.kind)).toEqual(["same", "added"]);
  });

  it("falls back to a full replacement for very large inputs", () => {
    const big = Array.from({ length: 1600 }, (_, n) => `l${n}`).join("\n");
    const lines = lineDiff(big, "x");
    expect(lines.filter((l) => l.kind === "same")).toHaveLength(0);
    expect(lines).toHaveLength(1601);
  });
});
