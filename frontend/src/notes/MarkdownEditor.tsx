import { cn } from "@/lib/utils";
import {
  AdmonitionDirectiveDescriptor,
  codeBlockPlugin,
  codeMirrorPlugin,
  directivesPlugin,
  frontmatterPlugin,
  headingsPlugin,
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
import { codeMirrorTheme } from "./codeMirrorTheme";
import { LinkPopover } from "./LinkPopover";

interface MarkdownEditorProps {
  markdown: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function MarkdownEditor({
  markdown,
  onChange,
  placeholder = "Notes here",
  className,
}: MarkdownEditorProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
    >
      <MDXEditor
        contentEditableClassName="prose markdown-content max-w-full"
        className="h-full overflow-y-auto"
        markdown={markdown}
        plugins={[
          listsPlugin(),
          quotePlugin(),
          headingsPlugin(),
          linkPlugin(),
          linkDialogPlugin({ LinkDialog: LinkPopover }),
          tablePlugin(),
          thematicBreakPlugin(),
          frontmatterPlugin(),
          codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
          codeMirrorPlugin({
            codeBlockLanguages: {
              js: "JavaScript",
              css: "CSS",
              txt: "Plain text",
              tsx: "TypeScript",
              py: "Python",
              rs: "Rust",
            },
            codeMirrorExtensions: [codeMirrorTheme],
          }),
          directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
          markdownShortcutPlugin(),
        ]}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}
