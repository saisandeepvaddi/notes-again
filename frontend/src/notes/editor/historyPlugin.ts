import { createRootEditorSubscription$, realmPlugin } from "@mdxeditor/editor";
import { $addUpdateTag, HISTORY_MERGE_TAG, TextNode } from "lexical";

const TYPING_PAUSE_MS = 900;

export const historyGroupingPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) => {
      let last = 0;
      return editor.registerNodeTransform(TextNode, () => {
        const now = Date.now();
        if (now - last < TYPING_PAUSE_MS) $addUpdateTag(HISTORY_MERGE_TAG);
        last = now;
      });
    });
  },
});
