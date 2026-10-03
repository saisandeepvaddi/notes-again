const literata = require("@expo-google-fonts/literata/400Regular/Literata_400Regular.ttf");
const literataSemibold = require("@expo-google-fonts/literata/600SemiBold/Literata_600SemiBold.ttf");
const literataItalic = require("@expo-google-fonts/literata/400Regular_Italic/Literata_400Regular_Italic.ttf");

export interface MarkdownPalette {
  foreground: string;
  mutedForeground: string;
  primary: string;
  secondary: string;
  border: string;
}

export const markdownCss = (p: MarkdownPalette, scheme: "light" | "dark") => `
@font-face { font-family: "Literata"; src: url(${literata}); font-weight: 400; font-style: normal; }
@font-face { font-family: "Literata"; src: url(${literataSemibold}); font-weight: 600; font-style: normal; }
@font-face { font-family: "Literata"; src: url(${literataItalic}); font-weight: 400; font-style: italic; }
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; -webkit-text-size-adjust: 100%; }
.markdown-content { display: flow-root; width: 100%; min-width: 0; max-width: 100vw; }
* { box-sizing: border-box; }
.markdown-content {
  font-family: "Literata", Georgia, serif; font-size: 17px; line-height: 1.6;
  color: ${p.foreground}; overflow-wrap: anywhere; -webkit-tap-highlight-color: transparent;
}
.markdown-content > :first-child { margin-top: 0; }
.markdown-content > :last-child { margin-bottom: 0; }
.markdown-content h1, .markdown-content h2, .markdown-content h3,
.markdown-content h4, .markdown-content h5, .markdown-content h6 { font-weight: 600; line-height: 1.3; }
.markdown-content h1 { margin: 1.1em 0 0.5em; font-size: 1.5em; }
.markdown-content h2 { margin: 1em 0 0.4em; font-size: 1.3em; }
.markdown-content h3 { margin: 1em 0 0.3em; font-size: 1.15em; }
.markdown-content h4, .markdown-content h5, .markdown-content h6 { margin: 0.8em 0 0.3em; font-size: 1em; }
.markdown-content p { margin: 0 0 0.75em; }
.markdown-content a { color: ${p.primary}; text-decoration: underline; text-underline-offset: 2px; }
.markdown-content ul, .markdown-content ol { margin: 0 0 0.75em; padding-left: 1.4em; }
.markdown-content li + li { margin-top: 0.15em; }
.markdown-content li > p { margin: 0; }
.markdown-content blockquote { margin: 0.75em 0; padding-left: 1em; border-left: 4px solid ${p.border}; color: ${p.mutedForeground}; font-style: italic; }
.markdown-content hr { margin: 1.25em 0; border: 0; border-top: 1px solid ${p.border}; }
.markdown-content code { font-family: ui-monospace, Menlo, monospace; font-size: 0.82em; background: ${p.secondary}; border-radius: 5px; padding: 0.12em 0.4em; }
.markdown-content pre { margin: 0.75em 0; padding: 12px; border-radius: 10px; background: ${p.secondary}; overflow-x: auto; font-size: 14px; line-height: 1.5; -webkit-overflow-scrolling: touch; }
.markdown-content pre code { background: transparent; padding: 0; font-size: inherit; }
.markdown-content .shiki { background-color: ${p.secondary} !important; }
${scheme === "dark" ? `.markdown-content .shiki, .markdown-content .shiki span { color: var(--shiki-dark) !important; }` : ""}
.markdown-content table { display: block; overflow-x: auto; margin: 0.75em 0; border-collapse: collapse; font-size: 15px; }
.markdown-content th, .markdown-content td { border: 1px solid ${p.border}; padding: 6px 10px; text-align: left; }
.markdown-content thead { background: ${p.secondary}; font-weight: 600; }
.markdown-content img { max-width: 100%; border-radius: 10px; margin: 0.5em 0; }
`;
