import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Marked } from "../src/command-palette/Marked";

const render = (text: string) =>
  renderToStaticMarkup(<Marked text={text} />).replace(/ class="[^"]*"/g, "");

describe("Marked", () => {
  it("wraps every marked run in <mark>", () => {
    expect(render("a \u0002sub\u0003string and \u0002sub\u0003 again")).toBe(
      "a <mark>sub</mark>string and <mark>sub</mark> again",
    );
  });

  it("leaves unmarked text alone", () => {
    expect(render("no matches here")).toBe("no matches here");
  });

  it("shows an unterminated marker's text without a highlight", () => {
    expect(render("cut \u0002off")).toBe("cut off");
  });

  it("escapes HTML in note text instead of rendering it", () => {
    expect(render("\u0002<img src=x>\u0003")).toBe("<mark>&lt;img src=x&gt;</mark>");
  });
});
