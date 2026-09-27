import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "../difficulty";
import { ProjectPicker } from "../ProjectPicker";
import { TagPicker } from "../TagPicker";
import type { Difficulty, Project, Tag } from "./types";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [project, setProject] = useState<Project | null>(null);
  const [pausedChoice, setPausedChoice] = useState<boolean | null>(null);
  const paused = pausedChoice ?? project?.paused ?? false;
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
        project_id: project?.id ?? null,
        paused,
      });
      navigate({
        to: "/notes",
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
      <div className="flex flex-wrap items-center gap-2">
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
      <ProjectPicker
        value={project}
        onChange={(next) => {
          setProject(next);
          setPausedChoice(null);
        }}
      />
      <TagPicker selectedTags={selectedTags} onToggle={toggleTag} />
      <label className="flex w-fit cursor-pointer items-start gap-2.5 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={paused}
          onCheckedChange={(checked) => setPausedChoice(checked === true)}
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Paused</span>
          <span className="text-xs text-muted-foreground">
            {project?.paused && pausedChoice === null
              ? `Checked because “${project.name}” is paused, so new notes in it start paused. Uncheck to review this one anyway.`
              : "Keep it as a note without adding it to review. You can resume it any time."}
          </span>
        </span>
      </label>
      <form.AppForm>
        <span>
          <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
        </span>
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
