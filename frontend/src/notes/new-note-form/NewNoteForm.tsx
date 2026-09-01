import { Input } from "@/components/ui/input";
import { getDefaultReminderDates } from "@/utils/dates";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const form = useAppForm({
    ...newNoteFormOptions,
    onSubmit: async ({ value }) => {
      console.log("value:", value);
      await mutateAsync({
        name: value.name,
        content: value.content,
        reminder_dates: getDefaultReminderDates(),
      });
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
        <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
