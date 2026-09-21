import { defineConfig } from "wxt";
import { FIREBASE_ORIGINS, hostPermissionPattern } from "./lib/url";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // WXT defaults Firefox to MV2, which lacks browser.action and optional_host_permissions; both are needed here.
  manifestVersion: 3,
  // Explicit imports everywhere; nothing here relies on auto-imports.
  imports: false,
  manifest: ({ browser }) => ({
    name: "Note and Learn Capture",
    description: "Save the current page or a text selection as a note in Note and Learn.",
    // activeTab is granted only when the user clicks the toolbar button, uses
    // a shortcut, or picks a context-menu item, so the extension never gets
    // standing access to every page's content.
    permissions: ["activeTab", "scripting", "contextMenus", "storage"],
    host_permissions: [
      // Local dev backend. Match patterns ignore the port.
      "http://localhost/*",
      "http://127.0.0.1/*",
      // Firebase email/password sign-in and token refresh (REST).
      ...FIREBASE_ORIGINS,
      // A build pre-configured with WXT_SERVER_URL is granted its server up front.
      ...(process.env.WXT_SERVER_URL ? [hostPermissionPattern(process.env.WXT_SERVER_URL)] : []),
    ],
    // A deployed server's origin is requested at runtime from the options page.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    action: { default_title: "Save this page to Note and Learn" },
    commands: {
      "save-page": {
        suggested_key: { default: "Alt+Shift+N" },
        description: "Save this page as a note",
      },
      "save-selection": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Save the selected text as a note",
      },
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "note-and-learn-capture@saisandeepvaddi",
          strict_min_version: "140.0",
          // Review before publishing to AMO. Declared honestly: text the user chooses to save
          // goes to the server they configure, and their login goes to Firebase.
          data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] },
        },
      },
    }),
  }),
});
