import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "../difficulty";
import { ProjectPicker } from "../ProjectPicker";
import { ReviewStatusPicker } from "../ReviewStatusPicker";
import { newNoteReviewFields, type ReviewStatus } from "../reviewStatus";
import { TagPicker } from "../TagPicker";
import type { Tag } from "./types";
import NewNoteContent from "./NewNoteContent";
import { newNoteFormOptions, useAppForm } from "./new-note-form-utils";
import { useCreateNewNote } from "./useCreateNewNote";
import { hasNewNoteDraft } from "./newNoteDraft";
import { useNewNoteDraft } from "./useNewNoteDraft";

const NEW_NOTE_STATUS_HINTS: Record<ReviewStatus, string> = {
  active: "Due for its first review right away.",
  paused: "Kept out of review for now. Resume it any time.",
  "note-only": "A plain note with no reviews or due dates. You can add it to review later.",
};

function NewNoteForm() {
  const { mutateAsync, isPending } = useCreateNewNote();
  const navigate = useNavigate();
  const recovery = useNewNoteDraft();
  const [initialValues] = useState(() => ({
    name: recovery.draft.name,
    content: recovery.draft.content,
  }));
  const { difficulty, project, statusChoice, tags: selectedTags } = recovery.draft;
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const created = useRef(false);
  const request = useRef<Promise<unknown> | null>(null);
  const hasDraft = hasNewNoteDraft(recovery.draft);
  const status = statusChoice ?? (project?.paused ? "paused" : "active");
  const toggleTag = (tag: Tag) => {
    recovery.update({
      tags: selectedTags.some((selected) => selected.id === tag.id)
        ? selectedTags.filter((selected) => selected.id !== tag.id)
        : [...selectedTags, tag],
    });
  };
  const form = useAppForm({
    ...newNoteFormOptions,
    defaultValues: initialValues,
    listeners: {
      onChange: ({ formApi }) => recovery.update(formApi.state.values),
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const pending = mutateAsync({
          name: value.name,
          content: value.content,
          first_reminder_at: new Date(),
          tag_ids: selectedTags.map((tag) => tag.id),
          difficulty,
          project_id: project?.id ?? null,
          ...newNoteReviewFields(status),
        });
        request.current = pending;
        await pending;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "The server couldn’t save the note.");
        return;
      } finally {
        request.current = null;
      }
      created.current = true;
      recovery.discard();
      await navigate({
        to: "/notes",
        replace: true,
      });
    },
  });
  const blocker = useBlocker({
    shouldBlockFn: async () => {
      await request.current?.catch(() => undefined);
      return !created.current && hasDraft && !recovery.persist();
    },
    enableBeforeUnload: !created.current && hasDraft && (!recovery.saved || isPending),
    withResolver: true,
  });

  const discard = () => {
    if (!recovery.discard()) return;
    form.reset({ name: "", content: "" });
    setEditorKey((key) => key + 1);
    setError(null);
    setDiscardOpen(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="flex flex-col gap-4"
    >
      {hasDraft ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="text-xs text-muted-foreground">
            {recovery.saved
              ? recovery.restored
                ? "Draft restored. Saved in this browser only."
                : "Draft saved in this browser only."
              : "Draft couldn’t be saved in this browser. Keep this page open until you create the note."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setDiscardOpen(true)}
          >
            Discard draft
          </Button>
        </div>
      ) : null}
      <fieldset disabled={isPending} className="contents">
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
        <div inert={isPending} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Note</span>
          <NewNoteContent key={editorKey} form={form} />
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
                onClick={() => recovery.update({ difficulty: option.value })}
                className={cn(
                  difficulty === option.value && DIFFICULTY_BADGE_CLASSES[option.value],
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Separator orientation="vertical" className="h-4" />
          <ProjectPicker
            value={project}
            onChange={(next) => {
              recovery.update({ project: next, statusChoice: null });
            }}
          />
          <Separator orientation="vertical" className="h-4" />
          <TagPicker selectedTags={selectedTags} onToggle={toggleTag} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ReviewStatusPicker
            value={status}
            onChange={(next) => recovery.update({ statusChoice: next })}
          />
          <p className="text-xs text-muted-foreground">
            {project?.paused && statusChoice === null
              ? `Paused because “${project.name}” is paused, so new notes in it start paused. Pick In review to review this one anyway.`
              : NEW_NOTE_STATUS_HINTS[status]}
          </p>
        </div>
      </fieldset>
      {error ? (
        <div role="alert" className="flex flex-col gap-1 text-xs">
          <p className="font-medium text-destructive">Couldn’t create the note</p>
          <p className="text-muted-foreground">
            {error} Your writing is still here. Try creating the note again.
          </p>
        </div>
      ) : null}
      <form.AppForm>
        <span>
          <form.SubmitButton disabled={isPending} label={isPending ? "Creating" : "Create"} />
        </span>
      </form.AppForm>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the unfinished note from this browser. It can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep writing</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={discard}>
              Discard draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This browser couldn’t save your draft. Leaving will lose your unfinished note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep writing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

export default NewNoteForm;
