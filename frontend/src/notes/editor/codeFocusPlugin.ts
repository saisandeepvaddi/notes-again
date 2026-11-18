import {
  $isCodeBlockNode,
  CodeBlockNode,
  createRootEditorSubscription$,
  realmPlugin,
} from "@mdxeditor/editor";
import { $getNodeByKey } from "lexical";

const FOCUS_DELAYS_MS = [80, 300];

export const codeFocusPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerMutationListener(CodeBlockNode, (mutations) => {
        const root = editor.getRootElement();
        if (!root?.contains(document.activeElement)) return;
        for (const [key, type] of mutations) {
          if (type !== "created") continue;
          const empty = editor.read(() => {
            const node = $getNodeByKey(key);
            return $isCodeBlockNode(node) && node.getCode() === "";
          });
          if (!empty) continue;
          for (const delay of FOCUS_DELAYS_MS) {
            setTimeout(() => {
              editor.read(() => {
                const node = $getNodeByKey(key);
                if ($isCodeBlockNode(node) && node.getCode() === "") node.select();
              });
            }, delay);
          }
        }
      }),
    );
  },
});
