import { describe, expect, it } from "vitest";
import { extractOutline } from "@/notes/outline";

describe("extractOutline", () => {
  it("lists headings in order and ignores code fences", () => {
    const items = extractOutline(
      "# One\ntext\n```md\n# not a heading\n```\n## Two *styled* ##\n### [Link](x) three\n####### seven",
    );
    expect(items.map((item) => [item.level, item.title])).toEqual([
      [1, "One"],
      [2, "Two styled"],
      [3, "Link three"],
    ]);
  });
});
