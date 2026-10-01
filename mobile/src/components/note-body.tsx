import * as Linking from "expo-linking";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import NoteMarkdown from "@/components/note-markdown";
import { useTheme } from "@/hooks/use-theme";

async function openLink(href: string) {
  if (/^https?:\/\//i.test(href)) {
    await WebBrowser.openBrowserAsync(href);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    await Linking.openURL(href);
  }
}

export function NoteBody({ markdown }: { markdown: string }) {
  const { scheme, colors } = useTheme();
  const [height, setHeight] = useState(1);
  if (!markdown.trim()) return null;
  return (
    <NoteMarkdown
      markdown={markdown}
      scheme={scheme}
      palette={{
        foreground: colors.foreground,
        mutedForeground: colors.mutedForeground,
        primary: colors.primary,
        secondary: colors.secondary,
        border: colors.border,
      }}
      onOpenLink={openLink}
      onHeight={async (next) => setHeight(next)}
      dom={{
        scrollEnabled: false,
        style: { width: "100%", height, backgroundColor: "transparent" },
        containerStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
