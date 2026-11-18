import { cn } from "@/lib/utils";
import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useMemo, useState } from "react";
import { attachmentObjectUrl, uploadAttachment } from "@/attachments/api";
import { attachmentUid } from "@/attachments/uri";
import { codeMirrorTheme } from "./codeMirrorTheme";
import { NoteContent } from "./NoteContent";
import { SourceEditor } from "./SourceEditor";
import { codeFocusPlugin } from "./editor/codeFocusPlugin";
import { historyGroupingPlugin } from "./editor/historyPlugin";
import { codeBlockLanguages } from "./editor/languages";
import { mermaidDescriptor } from "./editor/MermaidEditor";
import { rawMarkdownPlugin } from "./editor/rawPlugin";
import { LinkPopover } from "./LinkPopover";

interface MarkdownEditorProps {
  markdown: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  noteId?: number;
}

export function MarkdownEditor({
  markdown,
  onChange,
  placeholder = "Notes here",
  className,
  contentClassName,
  noteId,
}: MarkdownEditorProps) {
  const [parseFailed, setParseFailed] = useState<string | null>(null);
  const images = useMemo(
    () =>
      imagePlugin({
        imageUploadHandler:
          noteId === undefined
            ? undefined
            : async (file) => `attachment:${(await uploadAttachment(noteId, file)).uid}`,
        imagePreviewHandler: async (src) => {
          const uid = attachmentUid(src);
          return uid ? attachmentObjectUrl(uid) : src;
        },
      }),
    [noteId],
  );
  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
    >
      {parseFailed !== null ? (
        <div className="flex flex-col gap-2 py-1.5">
          <p className="text-xs text-muted-foreground" title={parseFailed}>
            This note uses Markdown the visual editor cannot open, so it is shown as source. Nothing
            was changed.
          </p>
          <SourceEditor value={markdown} onChange={onChange} />
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <NoteContent markdown={markdown} />
        </div>
      ) : (
        <MDXEditor
          onError={({ error }) => setParseFailed(error)}
          contentEditableClassName={cn("prose markdown-content max-w-full", contentClassName)}
          className="h-full overflow-y-auto"
          markdown={markdown}
          plugins={[
            listsPlugin(),
            quotePlugin(),
            headingsPlugin(),
            images,
            linkPlugin(),
            linkDialogPlugin({ LinkDialog: LinkPopover }),
            tablePlugin(),
            thematicBreakPlugin(),
            frontmatterPlugin(),
            codeBlockPlugin({
              defaultCodeBlockLanguage: "txt",
              codeBlockEditorDescriptors: [mermaidDescriptor],
            }),
            codeMirrorPlugin({
              codeBlockLanguages,
              codeMirrorExtensions: [codeMirrorTheme],
            }),
            directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
            rawMarkdownPlugin(),
            historyGroupingPlugin(),
            codeFocusPlugin(),
            markdownShortcutPlugin(),
          ]}
          placeholder={placeholder}
          onChange={(value, initialMarkdownNormalize) => {
            if (!initialMarkdownNormalize) onChange(value);
          }}
        />
      )}
    </div>
  );
}
