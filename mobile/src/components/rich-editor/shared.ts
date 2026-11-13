import { router } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { fetchLinkTarget } from "@/api/links";
import { openAttachment } from "@/attachments/native";

export const TOOLBAR_HEIGHT = 48;

export async function openLink(href: string) {
  const noteUid = /^note:([a-f0-9]{32})$/.exec(href.trim())?.[1];
  if (noteUid) {
    const target = await fetchLinkTarget(noteUid).catch(() => undefined);
    if (target && !target.trashed) router.push({ pathname: "/note/[id]", params: { id: target.id } });
    else Alert.alert("Note unavailable", "The linked note is in the trash or has not reached this device yet.");
    return;
  }
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
