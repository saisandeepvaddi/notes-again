import { createMarkdownExit } from "markdown-exit";

const markdown = createMarkdownExit({ html: false });
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
markdown.renderer.rules.link_open = (tokens, index, options, _environment, renderer) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return renderer.renderToken(tokens, index, options);
};
export function answerHtml(value: string): string {
  return markdown.render(value);
}
