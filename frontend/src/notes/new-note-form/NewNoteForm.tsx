import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "../difficulty";
import { TagPicker } from "../TagPicker";
import type { Difficulty, Tag } from "./types";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
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
        difficulty,
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
          const error = field.state.meta.isTouched ? field.state.meta.errors[0] : undefined;
          return (
            <div className="flex flex-col gap-1">
              <Input
                autoComplete="new-password"
                placeholder="Name"
                aria-invalid={Boolean(error)}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {error && <p className="text-xs text-destructive">{error.message}</p>}
            </div>
          );
        }}
      />
      <NewNoteContent form={form} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Difficulty</span>
        {DIFFICULTY_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDifficulty(option.value)}
            className={cn(difficulty === option.value && DIFFICULTY_BADGE_CLASSES[option.value])}
          >
            {option.label}
          </Button>
        ))}
      </div>
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
