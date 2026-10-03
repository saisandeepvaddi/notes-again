import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export const TOOLBAR_HEIGHT = 48;

export async function openLink(href: string) {
  if (/^https?:\/\//i.test(href)) {
    await WebBrowser.openBrowserAsync(href);
  } else if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    await Linking.openURL(href);
  }
}
