import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DifficultySelector } from "../DifficultySelector";
import { getDifficulty } from "../difficulty";
import { useAttachTag } from "../hooks/useAttachTag";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { useDetachTag } from "../hooks/useDetachTag";
import { useNote } from "../hooks/useNote";
import { useSetNoteStatus } from "../hooks/usePausing";
import { useSetProject } from "../hooks/useSetProject";
import { useUpdateNote } from "../hooks/useUpdateNote";
import { MarkdownEditor } from "../MarkdownEditor";
import type { Tag } from "../new-note-form/types";
import { lastNotesSearch } from "../notes-list/notesSearch";
import { NoteReminderList } from "../NoteReminderList";
import { NoteTitle } from "../NoteTitle";
import { ProjectPicker } from "../ProjectPicker";
import { REVIEW_STATUS_ICONS, ReviewStatusPicker } from "../ReviewStatusPicker";
import { reviewStatusOf, type ReviewStatus } from "../reviewStatus";
import { TagPicker } from "../TagPicker";

const AUTOSAVE_DELAY_MS = 800;

const STATUS_TOASTS: Record<ReviewStatus, string> = {
  active: "In review: it comes up on its schedule",
  paused: "Paused: kept out of review for now",
  "note-only": "Note only: no longer part of review",
};

const STATUS_NOTICES: Record<Exclude<ReviewStatus, "active">, string> = {
  paused: "Paused: kept out of review for now. Switch back to In review to pick up its schedule.",
  "note-only":
    "Note only: a plain note with no reviews or due dates. Switch to In review to start reviewing it.",
};

interface NoteDetailProps {
  noteId: number;
}

export function NoteDetail({ noteId }: NoteDetailProps) {
  const { data: note } = useNote(noteId);
  const navigate = useNavigate();
  const { mutateAsync: updateNote, isPending: isSaving } = useUpdateNote({ noteId });
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId });
  const { mutateAsync: attachTag } = useAttachTag({ noteId });
  const { mutateAsync: detachTag } = useDetachTag({ noteId });
  const { mutateAsync: setProject } = useSetProject({ noteId });
  const { mutateAsync: setStatus, isPending: isChangingStatus } = useSetNoteStatus(noteId);

  const [name, setName] = useState(note.name);
  const [editingTitle, setEditingTitle] = useState(false);
  const [content, setContent] = useState(note.content);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);

  useEffect(() => {
    setName(note.name);
    setEditingTitle(false);
    setContent(note.content);
    isFirstRender.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(async () => {
      try {
        await updateNote({ name, content });
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1500);
      } catch (error) {
        console.error("error:", error);
        toast.add({ type: "error", priority: "high", description: "Failed to save note" });
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, content]);

  const toggleTag = (tag: Tag) => {
    if (note.tags.some((attached) => attached.id === tag.id)) {
      detachTag(tag.id);
    } else {
      attachTag(tag.id);
    }
  };

  const status = reviewStatusOf(note);
  const StatusIcon = REVIEW_STATUS_ICONS[status];
  const changeStatus = async (next: ReviewStatus) => {
    try {
      await setStatus(next);
      toast.add({ type: "success", description: STATUS_TOASTS[next] });
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to update note" });
    }
  };

  const remove = async () => {
    try {
      await deleteNote();
      navigate({ to: "/notes", search: lastNotesSearch() });
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to delete note" });
    }
  };

  return (
    <div className="flex h-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="hidden md:inline-flex" />
          <Link
            to="/notes"
            search={lastNotesSearch()}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeftIcon className="size-3.5" /> All Notes
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isSaving ? "Saving…" : justSaved ? "Saved" : ""}
          </span>
          <Button size="sm" variant="destructive" onClick={remove}>
            <TrashIcon /> Delete
          </Button>
        </div>
      </div>

      {editingTitle ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setEditingTitle(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
          aria-label="Note title"
          className="h-auto border-input bg-input/20 px-2 py-1 font-heading text-lg font-semibold tracking-tight md:text-lg dark:bg-input/30"
        />
      ) : (
        <div className="relative rounded-md border border-transparent px-2 py-1 transition-colors has-[button:hover]:border-input has-[button:hover]:bg-input/20 dark:has-[button:hover]:bg-input/30">
          <button
            type="button"
            aria-label="Edit title"
            onClick={() => setEditingTitle(true)}
            className="absolute inset-0 cursor-text rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <h1 className="font-heading text-lg leading-7 font-semibold tracking-tight wrap-break-word">
            {name.trim() ? (
              <NoteTitle title={name} />
            ) : (
              <span className="text-muted-foreground">Untitled</span>
            )}
          </h1>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ReviewStatusPicker value={status} onChange={changeStatus} disabled={isChangingStatus} />
          {status !== "note-only" && (
            <NoteReminderList noteId={note.id} reminders={note.reminders} status={status} />
          )}
        </div>
        {status !== "active" && (
          <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <StatusIcon className="size-3.5 shrink-0" />
            {STATUS_NOTICES[status]}
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <DifficultySelector noteId={note.id} difficulty={difficulty} />
          <Separator orientation="vertical" className="h-4" />
          <ProjectPicker
            value={project}
            onChange={(next) => setProject(next?.id ?? null)}
            onProjectClick={(proj) =>
              navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: proj.id }) })
            }
            compact
          />
          <Separator orientation="vertical" className="h-4" />
          <TagPicker selectedTags={regularTags} onToggle={toggleTag} compact />
          <Separator orientation="vertical" className="h-4" />
          <Badge
            variant="outline"
            className="text-[10px] tracking-wide text-muted-foreground uppercase"
          >
            {note.algorithm}
          </Badge>
        </div>
      </div>

      <MarkdownEditor markdown={content} onChange={setContent} className="flex-1 min-h-0" />
    </div>
  );
}
