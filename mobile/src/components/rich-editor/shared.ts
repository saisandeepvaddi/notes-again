import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { openAttachment } from "@/attachments/native";

export const TOOLBAR_HEIGHT = 48;

export async function openLink(href: string) {
  const attachment = /^attachment:([a-f0-9]{32})$/.exec(href.trim())?.[1];
  if (attachment) {
    await openAttachment(attachment).catch(() =>
      Alert.alert("Attachment unavailable", "This file has not reached this device yet. Sync and try again."),
    );
    return;
  }
  if (/^https?:\/\//i.test(href)) {
    await WebBrowser.openBrowserAsync(href);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    await Linking.openURL(href);
  }
}
