import { createRootEditorSubscription$, insertMarkdown$, realmPlugin } from "@mdxeditor/editor";
import { COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from "lexical";
import { htmlToMarkdown, looksLikeMarkdown } from "../../markdown/htmlToMarkdown";

const OWN_FORMATS = ["application/x-lexical-editor", "vscode-editor-data"];

export const pastePlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!(event instanceof ClipboardEvent) || !event.clipboardData) return false;
          const data = event.clipboardData;
          if (data.files.length > 0) return false;
          if (OWN_FORMATS.some((format) => data.types.includes(format))) return false;
          const html = data.getData("text/html");
          const text = data.getData("text/plain");
          const markdown = html
            ? htmlToMarkdown(html)
            : looksLikeMarkdown(text)
              ? text.replace(/\r\n/g, "\n")
              : "";
          if (!markdown.trim()) return false;
          event.preventDefault();
          realm.pub(insertMarkdown$, markdown);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  },
});
