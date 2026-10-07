"use dom";

import "@mdxeditor/editor/style.css";
import { $createLinkNode, $isLinkNode, $toggleLink } from "@lexical/link";
import {
  AdmonitionDirectiveDescriptor,
  activeEditor$,
  addComposerChild$,
  applyBlockType$,
  applyFormat$,
  applyListType$,
  codeBlockPlugin,
  codeMirrorPlugin,
  currentBlockType$,
  currentFormat$,
  currentListType$,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  insertCodeBlock$,
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  type MDXEditorMethods,
  quotePlugin,
  realmPlugin,
  rootEditor$,
  tablePlugin,
  thematicBreakPlugin,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor";
import { type DOMImperativeFactory, useDOMImperativeHandle } from "expo/dom";
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  type LexicalNode,
  type RangeSelection,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { type Ref, useEffect, useRef, useState } from "react";
import {
  MONO_STACK,
  markdownCss,
  markdownFontStack,
  type MarkdownFont,
  type MarkdownPalette,
} from "@/components/markdown-css";
import type { BlockKind, CaretRect, FormatState, ListKind, RichEditorHandle } from "./types";

type Commands = Omit<RichEditorHandle, "focus" | "blur">;

export interface LinkAnchor {
  top: number;
  bottom: number;
  right: number;
}

class Hub {
  commands: Commands | null = null;
  selection: RangeSelection | null = null;
  private listener: ((state: FormatState) => void) | null = null;
  private anchorListener: ((anchor: LinkAnchor | null) => void) | null = null;

  remember(selection: RangeSelection) {
    this.selection = selection;
  }

  listenAnchor(listener: (anchor: LinkAnchor | null) => void) {
    this.anchorListener = listener;
  }

  emitAnchor(anchor: LinkAnchor | null) {
    this.anchorListener?.(anchor);
  }

  setCommands(commands: Commands) {
    this.commands = commands;
  }

  listen(listener: (state: FormatState) => void) {
    this.listener = listener;
  }

  emit(state: FormatState) {
    this.listener?.(state);
  }
}

interface RichEditorProps {
  ref?: Ref<RichEditorHandle>;
  markdown: string;
  placeholder: string;
  scheme: "light" | "dark";
  font: MarkdownFont;
  palette: MarkdownPalette & { primaryTint: string; primaryForeground: string };
  onChange: (markdown: string) => Promise<void>;
  onFormat: (state: FormatState) => Promise<void>;
  onFocusChange: (focused: boolean) => Promise<void>;
  onCaret: (caret: CaretRect) => Promise<void>;
  onHeight: (height: number) => Promise<void>;
  onOpenLink: (href: string) => Promise<void>;
  onEditLink: () => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}

function Bridge({ hub }: { hub: Hub }) {
  const [format, blockType, listType, active, root] = useCellValues(
    currentFormat$,
    currentBlockType$,
    currentListType$,
    activeEditor$,
    rootEditor$,
  );
  const [link, setLink] = useState<{ key: string; url: string; text: string } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const applyFormat = usePublisher(applyFormat$);
  const applyBlockType = usePublisher(applyBlockType$);
  const applyListType = usePublisher(applyListType$);
  const insertCodeBlock = usePublisher(insertCodeBlock$);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (!root) return;
    const offUndo = root.registerCommand(
      CAN_UNDO_COMMAND,
      (canUndo) => {
        setHistory((prev) => ({ ...prev, canUndo }));
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const offRedo = root.registerCommand(
      CAN_REDO_COMMAND,
      (canRedo) => {
        setHistory((prev) => ({ ...prev, canRedo }));
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      offUndo();
      offRedo();
    };
  }, [root]);

  useEffect(() => {
    const editor = active ?? root;
    if (!editor) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        hub.remember(selection.clone());
        setSelectionText(selection.isCollapsed() ? "" : selection.getTextContent());
        let node: LexicalNode | null = selection.anchor.getNode();
        while (node && !$isLinkNode(node)) node = node.getParent();
        const next = $isLinkNode(node)
          ? { key: node.getKey(), url: node.getURL(), text: node.getTextContent() }
          : null;
        setLink((prev) =>
          prev?.key === next?.key && prev?.url === next?.url && prev?.text === next?.text
            ? prev
            : next,
        );
        const element = next ? editor.getElementByKey(next.key) : null;
        const rects = element ? Array.from(element.getClientRects()) : [];
        const last = rects.at(-1);
        hub.emitAnchor(last ? { top: last.top, bottom: last.bottom, right: last.right } : null);
      });
    });
  }, [hub, active, root]);

  const linkKey = link?.key ?? null;
  const linkUrl = link?.url ?? null;
  const linkText = link?.text ?? null;

  useEffect(() => {
    hub.emit({
      bold: (format & IS_BOLD) !== 0,
      italic: (format & IS_ITALIC) !== 0,
      code: (format & IS_CODE) !== 0,
      block: blockType as BlockKind,
      list: listType as ListKind,
      link: linkUrl === null ? null : { url: linkUrl, text: linkText ?? "" },
      selectionText,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    });
  }, [hub, format, blockType, listType, linkUrl, linkText, selectionText, history]);

  useEffect(() => {
    const editor = active ?? root;
    hub.setCommands({
      format: (kind) => applyFormat(kind),
      block: (kind) => applyBlockType(kind),
      list: (kind) => applyListType(kind),
      codeBlock: () => insertCodeBlock({}),
      undo: () => root?.dispatchCommand(UNDO_COMMAND, undefined),
      redo: () => root?.dispatchCommand(REDO_COMMAND, undefined),
      indent: (direction) =>
        editor?.dispatchCommand(
          direction > 0 ? INDENT_CONTENT_COMMAND : OUTDENT_CONTENT_COMMAND,
          undefined,
        ),
      saveLink: (text, url) =>
        editor?.update(() => {
          const existing = linkKey ? $getNodeByKey(linkKey) : null;
          if ($isLinkNode(existing)) {
            existing.setURL(url);
            if (text && text !== existing.getTextContent()) {
              const [first, ...rest] = existing.getChildren();
              if ($isTextNode(first)) {
                first.setTextContent(text);
                for (const child of rest) child.remove();
              } else {
                existing.append($createTextNode(text));
                first?.remove();
                for (const child of rest) child.remove();
              }
            }
            return;
          }
          if (hub.selection) $setSelection(hub.selection.clone());
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return;
          const label = text || url;
          if (!selection.isCollapsed() && selection.getTextContent() === label) {
            $toggleLink(url);
            return;
          }
          const created = $createLinkNode(url);
          created.append($createTextNode(label));
          selection.insertNodes([created]);
        }),
      removeLink: () =>
        editor?.update(() => {
          const existing = linkKey ? $getNodeByKey(linkKey) : null;
          if (!$isLinkNode(existing)) return;
          for (const child of existing.getChildren()) existing.insertBefore(child);
          existing.remove();
        }),
    });
  }, [hub, active, root, linkKey, applyFormat, applyBlockType, applyListType, insertCodeBlock]);

  return null;
}

const geistMedium = require("@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf");

const PILL_HEIGHT = 30;
const PILL_WIDTH = 92;

const editorCss = (palette: RichEditorProps["palette"], font: MarkdownFont) => `
@font-face { font-family: "Geist"; src: url(${geistMedium}); font-weight: 500; font-style: normal; }
.link-edit-pill {
  position: absolute; z-index: 2; display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  width: ${PILL_WIDTH}px; height: ${PILL_HEIGHT}px; padding: 0; border: 0; border-radius: 999px;
  background: ${palette.primary}; color: ${palette.primaryForeground};
  font-family: "Geist", system-ui, sans-serif; font-weight: 500; font-size: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14); -webkit-tap-highlight-color: transparent;
  animation: pill-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.link-edit-pill:active { transform: scale(0.96); }
@keyframes pill-in { from { opacity: 0; transform: translateY(4px) scale(0.96); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .link-edit-pill { animation: none; } }
html, body { height: 100%; -webkit-user-select: text; user-select: text; }
.mdxeditor { width: 100%; font-family: inherit; color: inherit; background: transparent; }
.mdxeditor-root-contenteditable, .mdxeditor-root-contenteditable > div { padding: 0 !important; }
.markdown-content[contenteditable] { outline: none; min-height: 40vh; caret-color: ${palette.primary}; padding: 0 !important; }
.markdown-content ::selection { background: ${palette.primaryTint}; }
[class*="_placeholder_"] { padding: 0 !important; right: 0; white-space: normal; color: ${palette.mutedForeground}; font-family: ${markdownFontStack(font)}; font-size: 17px; line-height: 1.6; }
.markdown-content li[role="checkbox"] { list-style: none; position: relative; margin-left: -1.4em; padding-left: 1.6em; }
.markdown-content li[role="checkbox"]::before { content: ""; position: absolute; left: 0; top: 0.3em; width: 1em; height: 1em; border: 1.5px solid ${palette.mutedForeground}; border-radius: 4px; }
.markdown-content li[role="checkbox"][aria-checked="true"]::before { background: ${palette.primary}; border-color: ${palette.primary}; }
.markdown-content li[role="checkbox"][aria-checked="true"] { color: ${palette.mutedForeground}; text-decoration: line-through; }
.markdown-content li[role="checkbox"]::after { content: none; }
[class*="_codeMirrorWrapper_"] { margin: 0.75em 0; border-radius: 10px; background: ${palette.secondary}; border: 0; overflow: hidden; }
[class*="_codeMirrorToolbar_"] { display: none; }
.cm-editor { background: transparent !important; font-family: ${MONO_STACK}; font-size: 14px; }
.cm-gutters { display: none !important; }
.cm-content { padding: 12px 0 !important; caret-color: ${palette.primary}; }
.cm-line { padding: 0 12px !important; }
.cm-focused { outline: none !important; }
.cm-activeLine { background: transparent !important; }
.cm-selectionBackground, .cm-focused .cm-selectionBackground { background: ${palette.primaryTint} !important; }
`;

export default function RichEditor({
  ref,
  markdown,
  placeholder,
  scheme,
  font,
  palette,
  onChange,
  onFormat,
  onFocusChange,
  onCaret,
  onHeight,
  onOpenLink,
  onEditLink,
}: RichEditorProps) {
  const editor = useRef<MDXEditorMethods>(null);
  const root = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [isFocused, setIsFocused] = useState(false);
  const [pill, setPill] = useState<{ top: number; left: number } | null>(null);
  const [hub] = useState(() => new Hub());
  const [initial] = useState(markdown);
  const [plugins] = useState(() => [
    listsPlugin(),
    quotePlugin(),
    headingsPlugin(),
    linkPlugin(),
    linkDialogPlugin({ LinkDialog: () => <></> }),
    tablePlugin(),
    thematicBreakPlugin(),
    frontmatterPlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
    codeMirrorPlugin({
      codeBlockLanguages: {
        js: "JavaScript",
        css: "CSS",
        txt: "Plain text",
        tsx: "TypeScript",
        py: "Python",
        rs: "Rust",
      },
    }),
    directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
    markdownShortcutPlugin(),
    realmPlugin({
      init: (realm) => realm.pub(addComposerChild$, () => <Bridge hub={hub} />),
    })(),
  ]);

  useEffect(() => {
    hub.listen((state) => void onFormat(state));
  }, [hub, onFormat]);

  useDOMImperativeHandle(
    ref as unknown as Ref<DOMImperativeFactory>,
    () => {
      const handle: RichEditorHandle = {
        format: (kind) => hub.commands?.format(kind),
        block: (kind) => hub.commands?.block(kind),
        list: (kind) => hub.commands?.list(kind),
        codeBlock: () => hub.commands?.codeBlock(),
        saveLink: (text, url) => hub.commands?.saveLink(text, url),
        removeLink: () => hub.commands?.removeLink(),
        undo: () => hub.commands?.undo(),
        redo: () => hub.commands?.redo(),
        indent: (direction) => hub.commands?.indent(direction),
        focus: () => editor.current?.focus(undefined, { defaultSelection: "rootEnd" }),
        blur: () => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
        },
      };
      return handle as unknown as DOMImperativeFactory;
    },
    [],
  );

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let last = -1;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        void onHeight(height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeight]);

  useEffect(() => {
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = root.current;
        const selection = window.getSelection();
        if (!node || !focused.current || !selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        if (rect.top === 0 && rect.bottom === 0) {
          const container = range.startContainer;
          const element = container instanceof HTMLElement ? container : container.parentElement;
          if (!element) return;
          rect = element.getBoundingClientRect();
        }
        const origin = node.getBoundingClientRect().top;
        void onCaret({ top: rect.top - origin, bottom: rect.bottom - origin });
      });
    };
    document.addEventListener("selectionchange", report);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", report);
    };
  }, [onCaret]);

  useEffect(() => {
    const focusEnd = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[contenteditable], .cm-editor, a, .link-edit-pill")
      )
        return;
      editor.current?.focus(undefined, { defaultSelection: "rootEnd" });
    };
    document.addEventListener("click", focusEnd);
    return () => document.removeEventListener("click", focusEnd);
  }, []);

  useEffect(() => {
    hub.listenAnchor((anchor) => {
      const node = root.current;
      if (!anchor || !node) {
        setPill(null);
        return;
      }
      const box = node.getBoundingClientRect();
      const above = anchor.top - box.top - PILL_HEIGHT - 6;
      setPill({
        top: above >= 0 ? above : anchor.bottom - box.top + 6,
        left: Math.max(0, Math.min(anchor.right - box.left - PILL_WIDTH, box.width - PILL_WIDTH)),
      });
    });
  }, [hub]);

  const syncFocus = () =>
    setTimeout(() => {
      const next = !!root.current?.contains(document.activeElement);
      if (next === focused.current) return;
      focused.current = next;
      setIsFocused(next);
      void onFocusChange(next);
    }, 0);

  const linkFrom = (target: EventTarget) =>
    target instanceof Element ? target.closest("a")?.getAttribute("href") : null;

  return (
    <>
      <style>{markdownCss(palette, scheme, font)}</style>
      <style>{editorCss(palette, font)}</style>
      <div
        ref={root}
        style={{ width: "100%", position: "relative" }}
        onFocus={syncFocus}
        onBlur={syncFocus}
        onMouseDownCapture={(event) => {
          if (!focused.current && linkFrom(event.target)) event.preventDefault();
        }}
        onClickCapture={(event) => {
          const href = linkFrom(event.target);
          if (focused.current || !href) return;
          event.preventDefault();
          event.stopPropagation();
          void onOpenLink(href);
        }}
      >
        <MDXEditor
          ref={editor}
          className={scheme === "dark" ? "dark-theme" : undefined}
          contentEditableClassName="markdown-content"
          markdown={initial}
          placeholder={placeholder}
          plugins={plugins}
          onChange={(next, initialNormalize) => {
            if (!initialNormalize) void onChange(next);
          }}
        />
        {isFocused && pill ? (
          <button
            type="button"
            className="link-edit-pill"
            aria-label="Edit link"
            style={{ top: pill.top, left: pill.left }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onEditLink()}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-4-4L4 16v4Z M13.5 6.5l4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Edit link
          </button>
        ) : null}
      </div>
    </>
  );
}
