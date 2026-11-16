import { MarkdownEditor } from "../MarkdownEditor";
import { newNoteFormOptions, withForm } from "./new-note-form-utils";

export const NewNoteContent = withForm({
  ...newNoteFormOptions,
  render: function Render({ form }) {
    return (
      <form.AppField
        name="content"
        children={(field) => (
          <MarkdownEditor
            markdown={field.state.value}
            onChange={field.handleChange}
            className="rounded-none border-0 bg-transparent px-0 py-0 dark:bg-transparent"
            contentClassName="markdown-paper"
            placeholder="Start writing"
          />
        )}
      />
    );
  },
});

export default NewNoteContent;
