import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "../difficulty";
import { ProjectPicker } from "../ProjectPicker";
import { ReviewStatusPicker } from "../ReviewStatusPicker";
import { newNoteReviewFields, type ReviewStatus } from "../reviewStatus";
import { TagPicker } from "../TagPicker";
import type { Difficulty, Project, Tag } from "./types";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";

const NEW_NOTE_STATUS_HINTS: Record<ReviewStatus, string> = {
  active: "Due for its first review right away.",
  paused: "Kept out of review for now. Resume it any time.",
  "note-only": "A plain note with no reviews or due dates. You can add it to review later.",
};

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [project, setProject] = useState<Project | null>(null);
  const [statusChoice, setStatusChoice] = useState<ReviewStatus | null>(null);
  const status = statusChoice ?? (project?.paused ? "paused" : "active");
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
        ...newNoteReviewFields(status),
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
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-note-name" className="text-xs font-medium">
                Name
              </label>
              <Input
                id="new-note-name"
                autoComplete="new-password"
                placeholder="What is this note about?"
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
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Note</span>
        <NewNoteContent form={form} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Difficulty" className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Difficulty</span>
          {DIFFICULTY_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={difficulty === option.value}
              onClick={() => setDifficulty(option.value)}
              className={cn(difficulty === option.value && DIFFICULTY_BADGE_CLASSES[option.value])}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Separator orientation="vertical" className="h-4" />
        <ProjectPicker
          value={project}
          onChange={(next) => {
            setProject(next);
            setStatusChoice(null);
          }}
        />
        <Separator orientation="vertical" className="h-4" />
        <TagPicker selectedTags={selectedTags} onToggle={toggleTag} />
      </div>
      <div className="flex flex-col gap-1.5">
        <ReviewStatusPicker value={status} onChange={setStatusChoice} />
        <p className="text-xs text-muted-foreground">
          {project?.paused && statusChoice === null
            ? `Paused because “${project.name}” is paused, so new notes in it start paused. Pick In review to review this one anyway.`
            : NEW_NOTE_STATUS_HINTS[status]}
        </p>
      </div>
      <form.AppForm>
        <span>
          <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
        </span>
      </form.AppForm>
    </form>
  );
}

export default NewNoteForm;
