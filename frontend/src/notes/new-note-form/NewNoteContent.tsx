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

import { newNoteFormOptions, withForm } from "./new-note-form-utils";

export const NewNoteContent = withForm({
  ...newNoteFormOptions,
  render: function Render({ form }) {
    return (
      <form.AppField
        name="content"
        children={(field) => {
          return (
            <div className="min-w-1/2 min-h-1/2 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-xs/relaxed dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40">
              <MDXEditor
                contentEditableClassName="prose max-w-full font-sans"
                markdown={field.state.value}
                plugins={[
                  listsPlugin(),
                  quotePlugin(),
                  headingsPlugin(),
                  linkPlugin(),
                  linkDialogPlugin(),
                  tablePlugin(),
                  thematicBreakPlugin(),
                  frontmatterPlugin(),
                  codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
                  codeMirrorPlugin({
                    codeBlockLanguages: {
                      js: "JavaScript",
                      css: "CSS",
                      txt: "text",
                      tsx: "TypeScript",
                      py: "Python",
                      rs: "Rust",
                    },
                  }),
                  directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
                  markdownShortcutPlugin(),
                ]}
                placeholder="Notes here"
                onChange={(value) => field.handleChange(value)}
              />
            </div>
          );
        }}
      />
    );
  },
});

export default NewNoteContent;
