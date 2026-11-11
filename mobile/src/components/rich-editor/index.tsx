import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { KeyboardStickyView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { attachmentDataUrl } from "@/attachments/native";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";
import { EditorBridge } from "./bridge";
import { type LinkDraft, LinkSheet } from "./link-sheet";
import RichEditor from "./rich-editor";
import { openLink, TOOLBAR_HEIGHT } from "./shared";
import { MarkdownToolbar } from "./toolbar";
import { type CaretRect, EMPTY_FORMAT, type FormatState } from "./types";

export { TOOLBAR_HEIGHT };

export function useRichEditor() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const [bridge] = useState(() => new EditorBridge());
  const [focused, setFocused] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [format, setFormat] = useState<FormatState>(EMPTY_FORMAT);
  const band = {
    ceiling: insets.top + 72,
    floor: windowHeight - keyboardHeight - TOOLBAR_HEIGHT - 24,
  };

  useEffect(() => {
    if (focused && keyboardHeight > 0) bridge.reveal(band);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardHeight, focused]);

  return {
    bridge,
    format,
    linkDraft,
    openLinkEditor: () =>
      setLinkDraft(
        format.link
          ? { text: format.link.text, url: format.link.url, existing: true }
          : { text: format.selectionText, url: "", existing: false },
      ),
    closeLinkEditor: () => setLinkDraft(null),
    toolbarVisible: focused && linkDraft === null,
    onFormat: async (next: FormatState) => setFormat(next),
    onFocusChange: async (next: boolean) => {
      setFocused(next);
    },
    onCaret: async (rect: CaretRect) => {
      bridge.setCaret(rect);
      bridge.reveal(band);
    },
  };
}

export type RichEditorController = ReturnType<typeof useRichEditor>;

interface RichEditorBodyProps {
  controller: RichEditorController;
  markdown: string;
  placeholder: string;
  minHeight: number;
  onChange: (markdown: string) => void;
}

export function RichEditorBody({
  controller,
  markdown,
  placeholder,
  minHeight,
  onChange,
}: RichEditorBodyProps) {
  const { scheme, colors } = useTheme();
  const { font } = useReadingFont();
  const [height, setHeight] = useState(minHeight);
  const { bridge, onFormat, onFocusChange, onCaret, openLinkEditor } = controller;
  const { attachBody, attachHandle } = bridge;
  return (
    <View ref={attachBody} collapsable={false} style={{ minHeight }}>
      <RichEditor
        ref={attachHandle}
        markdown={markdown}
        placeholder={placeholder}
        scheme={scheme}
        font={font}
        palette={{
          foreground: colors.foreground,
          mutedForeground: colors.mutedForeground,
          primary: colors.primary,
          primaryTint: colors.primaryTint,
          primaryForeground: colors.primaryForeground,
          secondary: colors.secondary,
          border: colors.border,
        }}
        onChange={async (next) => onChange(next)}
        onFormat={onFormat}
        onFocusChange={onFocusChange}
        onCaret={onCaret}
        onHeight={async (next) => setHeight(next)}
        onOpenLink={openLink}
        loadAttachment={attachmentDataUrl}
        onEditLink={async () => openLinkEditor()}
        dom={{
          scrollEnabled: false,
          hideKeyboardAccessoryView: true,
          style: {
            width: "100%",
            height: Math.max(height, minHeight),
            backgroundColor: "transparent",
          },
          containerStyle: { backgroundColor: "transparent" },
        }}
      />
    </View>
  );
}

export function RichEditorToolbar({ controller }: { controller: RichEditorController }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const { bridge, linkDraft, closeLinkEditor } = controller;
  const sheet = (
    <LinkSheet
      draft={linkDraft}
      onClose={closeLinkEditor}
      onSave={(text, url) => {
        bridge.handle?.saveLink(text, url);
        closeLinkEditor();
      }}
      onRemove={() => {
        bridge.handle?.removeLink();
        closeLinkEditor();
      }}
    />
  );
  if (!controller.toolbarVisible) return sheet;
  return (
    <>
      {sheet}
      <KeyboardStickyView
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingBottom: keyboardVisible ? 0 : insets.bottom,
          backgroundColor: colors.shelf,
        }}
      >
        <MarkdownToolbar controller={controller} />
      </KeyboardStickyView>
    </>
  );
}
