import * as Linking from "expo-linking";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { openLink as openEditorLink } from "@/components/rich-editor/shared";
import { attachmentDataUrl } from "@/attachments/native";
import NoteMarkdown from "@/components/note-markdown";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";

async function openLink(href: string) {
  if (/^(attachment|note):/.test(href)) return openEditorLink(href);
  if (/^https?:\/\//i.test(href)) {
    await WebBrowser.openBrowserAsync(href);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    await Linking.openURL(href);
  }
}

export function NoteBody({ markdown }: { markdown: string }) {
  const { scheme, colors } = useTheme();
  const { font } = useReadingFont();
  const [height, setHeight] = useState(1);
  if (!markdown.trim()) return null;
  return (
    <NoteMarkdown
      markdown={markdown}
      scheme={scheme}
      font={font}
      palette={{
        foreground: colors.foreground,
        mutedForeground: colors.mutedForeground,
        primary: colors.primary,
        secondary: colors.secondary,
        border: colors.border,
      }}
      onOpenLink={openLink}
      loadAttachment={attachmentDataUrl}
      onHeight={async (next) => setHeight(next)}
      dom={{
        scrollEnabled: false,
        style: { width: "100%", height, backgroundColor: "transparent" },
        containerStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
