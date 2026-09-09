import { Input } from "@/components/ui/input";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TagPicker } from "../TagPicker";
import type { Tag } from "./types";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const toggleTag = (tag: Tag) => {
    setSelectedTags((current) =>
      current.some((selected) => selected.id === tag.id)
        ? current.filter((selected) => selected.id !== tag.id)
        : [...current, tag],
    );
  };
  const form = useAppForm({
    ...newNoteFormOptions,
    onSubmit: async ({ value }) => {
      await mutateAsync({
        name: value.name,
        content: value.content,
        first_reminder_at: new Date(),
        tag_ids: selectedTags.map((tag) => tag.id),
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
      <TagPicker selectedTags={selectedTags} onToggle={toggleTag} />
      <form.AppForm>
        <span>
          <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
        </span>
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
