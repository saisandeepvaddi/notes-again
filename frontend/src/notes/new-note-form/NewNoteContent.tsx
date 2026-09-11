import { MarkdownEditor } from "../MarkdownEditor";
import { newNoteFormOptions, withForm } from "./new-note-form-utils";

export const NewNoteContent = withForm({
  ...newNoteFormOptions,
  render: function Render({ form }) {
    return (
      <form.AppField
        name="content"
        children={(field) => (
          <MarkdownEditor markdown={field.state.value} onChange={field.handleChange} />
        )}
      />
    );
  },
});

export default NewNoteContent;
