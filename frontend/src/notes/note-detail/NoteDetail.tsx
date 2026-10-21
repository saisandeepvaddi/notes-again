import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { cn } from "@/lib/utils";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DotsThreeIcon,
  SpinnerGapIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DifficultySelector } from "../DifficultySelector";
import { getDifficulty } from "../difficulty";
import { useAttachTag } from "../hooks/useAttachTag";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { useDetachTag } from "../hooks/useDetachTag";
import type { NoteItem, Tag } from "../new-note-form/types";
import { useRestoreNote } from "../hooks/useRestoreNote";
import { useSetNoteStatus } from "../hooks/usePausing";
import { useSetProject } from "../hooks/useSetProject";
import { useUpdateNote } from "../hooks/useUpdateNote";
import { MarkdownEditor } from "../MarkdownEditor";
import { lastNotesSearch } from "../notes-list/notesSearch";
import { NoteReminderList } from "../NoteReminderList";
import { NoteTitle } from "../NoteTitle";
import { NoteDetailsSheet } from "./NoteDetailsSheet";
import { ProjectPicker } from "../ProjectPicker";
import { REVIEW_STATUS_ICONS, ReviewStatusPicker } from "../ReviewStatusPicker";
import { reviewStatusOf, type ReviewStatus } from "../reviewStatus";
import { TagPicker } from "../TagPicker";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "saved" | "unsaved" | "saving" | "error";

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
  note: NoteItem;
}

export function NoteDetail({ note }: NoteDetailProps) {
  const noteId = note.id;
  const navigate = useNavigate();
  const { mutateAsync: updateNote } = useUpdateNote({ noteId });
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId });
  const { mutateAsync: restoreNote } = useRestoreNote({ noteId });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const { mutateAsync: attachTag } = useAttachTag({ noteId });
  const { mutateAsync: detachTag } = useDetachTag({ noteId });
  const { mutateAsync: setProject } = useSetProject({ noteId });
  const { mutateAsync: setStatus, isPending: isChangingStatus } = useSetNoteStatus(noteId);

  const [name, setName] = useState(note.name);
  useDocumentTitle(name.trim() || "Untitled note");
  const [editingTitle, setEditingTitle] = useState(false);
  const [content, setContent] = useState(note.content);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef<Promise<unknown> | null>(null);
  const isFirstRender = useRef(true);
  const editVersion = useRef(0);
  const leaveAfterDelete = useRef(false);

  const changeName = (value: string) => {
    editVersion.current += 1;
    setSaveState("unsaved");
    setName(value);
  };
  const changeContent = (value: string) => {
    editVersion.current += 1;
    setSaveState("unsaved");
    setContent(value);
  };

  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);

  useEffect(() => {
    setName(note.name);
    setEditingTitle(false);
    setContent(note.content);
    setSaveState("saved");
    editVersion.current = 0;
    isFirstRender.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const persist = async (version: number, draft: { name: string; content: string }) => {
    try {
      await saveInFlight.current?.catch(() => undefined);
      if (version !== editVersion.current) return;
      setSaveState("saving");
      const request = updateNote(draft);
      saveInFlight.current = request;
      try {
        await request;
      } finally {
        if (saveInFlight.current === request) saveInFlight.current = null;
      }
      if (version === editVersion.current) setSaveState("saved");
    } catch (error) {
      if (version === editVersion.current) setSaveState("error");
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to save note" });
      throw error;
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const version = editVersion.current;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist(version, { name, content }).catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, content]);

  useBlocker({
    shouldBlockFn: async () => {
      if (leaveAfterDelete.current || saveState === "saved") return false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      try {
        await persist(editVersion.current, { name, content });
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: saveState !== "saved",
  });

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
      if (saveState !== "saved") {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await persist(editVersion.current, { name, content });
      }
      await deleteNote();
      leaveAfterDelete.current = true;
      setDeleteOpen(false);
      navigate({ to: "/notes", search: lastNotesSearch() });
      toast.add({
        type: "success",
        title: "Note moved to trash",
        description: "Restore it from Trash anytime.",
        timeout: 8000,
        actionProps: {
          children: "Undo",
          onClick: async () => {
            try {
              await restoreNote();
              navigate({ to: "/notes/$noteId", params: { noteId: String(noteId) } });
            } catch (error) {
              console.error("error:", error);
              toast.add({
                type: "error",
                priority: "high",
                description: "Couldn't restore the note",
              });
            }
          },
        },
      });
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to delete note" });
    }
  };

  return (
    <div className="flex h-full max-w-4xl flex-col gap-4">
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

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => changeName(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              }}
              aria-label="Note title"
              className="h-auto border-input bg-input/20 px-2 py-1 font-reading text-xl leading-tight font-semibold tracking-tight md:text-2xl dark:bg-input/30"
            />
          ) : (
            <div className="relative rounded-md border border-transparent px-2 py-1 transition-colors has-[button:hover]:border-input has-[button:hover]:bg-input/20 dark:has-[button:hover]:bg-input/30">
              <button
                type="button"
                aria-label="Edit title"
                onClick={() => setEditingTitle(true)}
                className="absolute inset-0 cursor-text rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <h1 className="font-reading text-xl leading-tight font-semibold tracking-tight wrap-break-word md:text-2xl">
                {name.trim() ? (
                  <NoteTitle title={name} />
                ) : (
                  <span className="text-muted-foreground">Untitled</span>
                )}
              </h1>
            </div>
          )}
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-1 md:mt-1.5">
          <span
            role="status"
            aria-live="polite"
            title={SAVE_STATE_LABELS[saveState]}
            className={cn(
              "flex items-center gap-1 px-1 text-xs text-muted-foreground",
              saveState === "error" && "text-destructive",
            )}
          >
            <SaveStateIcon state={saveState} />
            <span className="sr-only sm:not-sr-only">{SAVE_STATE_LABELS[saveState]}</span>
          </span>
          <NoteDetailsSheet note={note} />
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="More note actions"
                  title="More note actions"
                >
                  <DotsThreeIcon />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-40 p-1">
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => {
                  setActionsOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <TrashIcon /> Move to trash
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TrashIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Move this note to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves review and can be restored from Trash later. You can also undo this from the
              notification.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ReviewStatusPicker value={status} onChange={changeStatus} disabled={isChangingStatus} />
          {status !== "note-only" && (
            <NoteReminderList
              noteId={note.id}
              reminders={note.reminders}
              status={status}
              showHistory={false}
            />
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
        </div>
      </div>

      <MarkdownEditor
        markdown={content}
        onChange={changeContent}
        className="min-h-64 flex-1 bg-card px-3 py-2 dark:bg-card"
      />
    </div>
  );
}

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save. Your changes are still here.",
};

function SaveStateIcon({ state }: { state: SaveState }) {
  if (state === "saving") return <SpinnerGapIcon className="size-3.5 animate-spin" />;
  if (state === "error") return <WarningCircleIcon className="size-3.5" />;
  if (state === "unsaved") return <ClockIcon className="size-3.5" />;
  return <CheckCircleIcon className="size-3.5" />;
}
