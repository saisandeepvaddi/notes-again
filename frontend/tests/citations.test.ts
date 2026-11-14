import { describe, expect, it } from "vitest";
import { chatAnswerAsNote, checkCitations } from "../src/discussion/citations";

const passages = [
  { n: 1, note_id: 7, note_uid: "u7", title: "Rust", text: "x" },
  { n: 2, note_id: 9, note_uid: "u9", title: "Go", text: "y" },
];

describe("chat citations", () => {
  it("links retrieved passages and flags numbers that were never sent", () => {
    const check = checkCitations("Ownership [1] and channels [2], plus [5].", passages);
    expect(check.text).toBe("Ownership [[1]](/notes/7) and channels [[2]](/notes/9), plus [5?].");
    expect(check.cited).toEqual([1, 2]);
    expect(check.unverified).toEqual([5]);
  });

  it("leaves existing Markdown links alone", () => {
    expect(checkCitations("See [1](https://x.test)", passages).text).toBe(
      "See [1](https://x.test)",
    );
  });

  it("saves an answer as a Note only with stable source links", () => {
    const note = chatAnswerAsNote(
      { question: "Q?", answer: "A [1]", provider: "openai", model: "m", sources: passages },
      "Library",
    );
    expect(note.in_review).toBe(false);
    expect(note.content).toContain('source_note_uids: ["u7","u9"]');
    expect(note.content).toContain("1. [Rust](note:u7)");
  });
});
