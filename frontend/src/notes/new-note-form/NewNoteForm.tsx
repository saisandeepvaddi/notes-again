import { Input } from "@/components/ui/input";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";

function NewNoteForm() {
  const form = useAppForm({
    ...newNoteFormOptions,
    onSubmit: async ({ value }) => {
      console.log("value:", value);
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.AppField
        name="name"
        children={(field) => {
          return (
            <Input
              placeholder="Name"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          );
        }}
      />
      <NewNoteContent form={form} />
      <form.AppForm>
        <form.SubmitButton label="Create" />
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
