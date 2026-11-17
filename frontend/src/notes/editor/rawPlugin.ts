import {
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  type LexicalExportVisitor,
  type MdastImportVisitor,
} from "@mdxeditor/editor";
import type { ElementNode } from "lexical";
import type { Nodes } from "mdast";
import { gfmFootnoteFromMarkdown, gfmFootnoteToMarkdown } from "mdast-util-gfm-footnote";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmFootnote } from "micromark-extension-gfm-footnote";
import { math } from "micromark-extension-math";
import { $createRawNode, $isRawNode, RawNode, type RawKind } from "./rawNode";

function source(node: Nodes) {
  return toMarkdown(node, {
    extensions: [mathToMarkdown(), gfmFootnoteToMarkdown()] as never,
  }).replace(/\n+$/, "");
}

function visitor(type: string, kind: RawKind, inline: boolean): MdastImportVisitor<Nodes> {
  return {
    testNode: type,
    priority: 100,
    visitNode({ mdastNode, lexicalParent }) {
      const value = source(mdastNode);
      (lexicalParent as ElementNode).append($createRawNode(value, kind, inline));
    },
  };
}

const exportRaw: LexicalExportVisitor<RawNode, Nodes> = {
  testLexicalNode: $isRawNode,
  visitLexicalNode({ lexicalNode, actions }) {
    actions.addAndStepInto("html", { value: lexicalNode.getValue() }, false);
  },
};

export const rawMarkdownPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addSyntaxExtension$]: [math(), gfmFootnote()],
      [addMdastExtension$]: [mathFromMarkdown(), gfmFootnoteFromMarkdown()],
      [addToMarkdownExtension$]: [mathToMarkdown(), gfmFootnoteToMarkdown()],
      [addLexicalNode$]: RawNode,
      [addImportVisitor$]: [
        visitor("math", "math", false),
        visitor("inlineMath", "math", true),
        visitor("footnoteReference", "footnote", true),
        visitor("footnoteDefinition", "footnote", false),
      ],
      [addExportVisitor$]: exportRaw,
    });
  },
});
