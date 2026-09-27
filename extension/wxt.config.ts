import { defineConfig } from "wxt";
import { hostPermissionPattern } from "./lib/url";

export default defineConfig({
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  imports: false,
  manifest: ({ browser }) => ({
    name: "Note and Learn Capture",
    description: "Save the current page or a text selection as a note in Note and Learn.",
    permissions: ["activeTab", "scripting", "contextMenus", "storage"],
    host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      ...(process.env.WXT_SERVER_URL ? [hostPermissionPattern(process.env.WXT_SERVER_URL)] : []),
    ],
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
          data_collection_permissions: { required: ["websiteContent", "authenticationInfo"] },
        },
      },
    }),
  }),
});
