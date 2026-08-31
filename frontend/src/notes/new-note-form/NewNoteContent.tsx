import { headingsPlugin, MDXEditor } from "@mdxeditor/editor";

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
            <MDXEditor
              className="border"
              markdown={field.state.value}
              plugins={[headingsPlugin()]}
              onChange={(value) => field.handleChange(value)}
            />
          );
        }}
      />
    );
  },
});

export default NewNoteContent;
