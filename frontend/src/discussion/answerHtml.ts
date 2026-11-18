import "katex/dist/katex.min.css";
import { createMarkdown } from "@/markdown/render";

const markdown = createMarkdown({ links: "raw", html: false, highlight: false });
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
const linkOpen = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return linkOpen
    ? linkOpen(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options);
};

export function answerHtml(value: string): string {
  return markdown.render(value);
}
