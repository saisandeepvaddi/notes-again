import { Input } from "@/components/ui/input";
import { getDefaultReminderDates } from "@/utils/dates";
import { useNavigate } from "@tanstack/react-router";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const form = useAppForm({
    ...newNoteFormOptions,
    onSubmit: async ({ value }) => {
      console.log("value:", value);
      await mutateAsync({
        name: value.name,
        content: value.content,
        reminder_dates: getDefaultReminderDates(),
      });
      navigate({
        to: "/",
        replace: true,
      });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      <form.AppField
        name="name"
        children={(field) => {
          return (
            <Input
              autoComplete="new-password"
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
        <span>
          <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
        </span>
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
