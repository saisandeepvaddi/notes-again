import { describe, expect, it } from "vitest";
import { markdownExcerpt } from "../src/notes/markdownExcerpt";
import { noteTitleText } from "../src/notes/NoteTitle";

describe("markdownExcerpt", () => {
  it.each([
    ["# Heading", "Heading"],
    ["- list item", "list item"],
    ["3. numbered", "numbered"],
    ["> quoted", "quoted"],
    ["Use `set()` here", "Use set() here"],
    ["See [the docs](https://x.dev) and ![alt](a.png)", "See the docs and alt"],
    ["**bold** and _em_ and ~~gone~~", "bold and em and gone"],
  ])("strips markdown from %j", (markdown, expected) => {
    expect(markdownExcerpt(markdown)).toBe(expected);
  });

  it("uses the first non-empty line", () => {
    expect(markdownExcerpt("\n\n  \nSecond paragraph\nThird")).toBe("Second paragraph");
  });

  it("truncates to the limit with an ellipsis", () => {
    const excerpt = markdownExcerpt("a".repeat(50), 10);
    expect(excerpt).toBe(`${"a".repeat(9)}…`);
    expect(excerpt).toHaveLength(10);
  });

  it("is empty for blank notes", () => {
    expect(markdownExcerpt("   \n\n")).toBe("");
  });
});

describe("noteTitleText", () => {
  it.each([
    ["[3. Longest Substring](https://leetcode.com/problems/x)", "3. Longest Substring"],
    ["## **Contains** Duplicate", "Contains Duplicate"],
    ["Use `Map` for `O(1)` lookups", "Use Map for O(1) lookups"],
    ["Plain title", "Plain title"],
  ])("renders %j as plain text", (title, expected) => {
    expect(noteTitleText(title)).toBe(expected);
  });
});
