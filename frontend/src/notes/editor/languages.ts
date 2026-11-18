import { languages } from "@codemirror/language-data";

const EXTRA: { name: string; alias: string[]; extensions: string[] }[] = [
  { name: "Plain text", alias: ["txt", "text", "plain", "plaintext"], extensions: [] },
  { name: "Mermaid", alias: ["mermaid"], extensions: [] },
  { name: "TOML", alias: ["toml"], extensions: ["toml"] },
  { name: "Dockerfile", alias: ["dockerfile", "docker"], extensions: [] },
  { name: "Diff", alias: ["diff", "patch"], extensions: ["diff", "patch"] },
];

const known = new Set(
  languages.flatMap((language) => [language.name.toLowerCase(), ...language.alias]),
);

export const codeBlockLanguages: {
  name: string;
  alias: readonly string[];
  extensions: readonly string[];
}[] = [
  ...EXTRA.filter((entry) => !entry.alias.some((alias) => known.has(alias))),
  ...languages,
].sort((a, b) => a.name.localeCompare(b.name));
