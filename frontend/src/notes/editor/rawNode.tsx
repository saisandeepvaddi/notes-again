import { DecoratorNode, type LexicalNode, type SerializedLexicalNode, type Spread } from "lexical";
import type { ReactNode } from "react";
import { RawView } from "./RawView";

export type RawKind = "math" | "footnote";

export type SerializedRawNode = Spread<
  { value: string; kind: RawKind; inline: boolean },
  SerializedLexicalNode
>;

export class RawNode extends DecoratorNode<ReactNode> {
  __value: string;
  __kind: RawKind;
  __inline: boolean;

  constructor(value: string, kind: RawKind, inline: boolean, key?: string) {
    super(key);
    this.__value = value;
    this.__kind = kind;
    this.__inline = inline;
  }

  static getType() {
    return "raw-markdown";
  }

  static clone(node: RawNode) {
    return new RawNode(node.__value, node.__kind, node.__inline, node.__key);
  }

  static importJSON(serialized: SerializedRawNode) {
    return new RawNode(serialized.value, serialized.kind, serialized.inline);
  }

  exportJSON(): SerializedRawNode {
    return {
      type: "raw-markdown",
      version: 1,
      value: this.__value,
      kind: this.__kind,
      inline: this.__inline,
    };
  }

  createDOM() {
    const element = document.createElement(this.__inline ? "span" : "div");
    element.className = this.__inline ? "raw-md raw-md-inline" : "raw-md raw-md-block";
    return element;
  }

  updateDOM() {
    return false;
  }

  getValue() {
    return this.getLatest().__value;
  }

  getKind() {
    return this.__kind;
  }

  setValue(value: string) {
    this.getWritable().__value = value;
  }

  isInline() {
    return this.__inline;
  }

  isKeyboardSelectable() {
    return true;
  }

  decorate(editor: Parameters<DecoratorNode<ReactNode>["decorate"]>[0]) {
    return (
      <RawView
        value={this.getValue()}
        kind={this.__kind}
        inline={this.__inline}
        onChange={(value) => editor.update(() => this.setValue(value))}
      />
    );
  }
}

export function $createRawNode(value: string, kind: RawKind, inline: boolean) {
  return new RawNode(value, kind, inline);
}

export function $isRawNode(node: LexicalNode | null | undefined): node is RawNode {
  return node instanceof RawNode;
}
