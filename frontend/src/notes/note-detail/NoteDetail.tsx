import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DifficultySelector } from "../DifficultySelector";
import { getDifficulty } from "../difficulty";
import { useAttachTag } from "../hooks/useAttachTag";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { useDetachTag } from "../hooks/useDetachTag";
import { useNote } from "../hooks/useNote";
import { useSetProject } from "../hooks/useSetProject";
import { useUpdateNote } from "../hooks/useUpdateNote";
import { MarkdownEditor } from "../MarkdownEditor";
import type { Tag } from "../new-note-form/types";
import { NoteReminderList } from "../NoteReminderList";
import { ProjectPicker } from "../ProjectPicker";
import { TagPicker } from "../TagPicker";

const AUTOSAVE_DELAY_MS = 800;

interface NoteDetailProps {
  noteId: number;
}

// A "Label value" pair, inline. Meant to sit in a flex-wrap row with
// vertical Separators between groups -- if it doesn't fit one line, the
// whole row wraps rather than each group stacking to its own line.
function PropertyGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Directly editable, no separate edit mode -- this page (unlike the
// read-only note card) is exactly where tag/project/name/content changes
// happen, so nothing here should require an extra click to unlock.
export function NoteDetail({ noteId }: NoteDetailProps) {
  const { data: note } = useNote(noteId);
  const navigate = useNavigate();
  const { mutateAsync: updateNote, isPending: isSaving } = useUpdateNote({ noteId });
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId });
  const { mutateAsync: attachTag } = useAttachTag({ noteId });
  const { mutateAsync: detachTag } = useDetachTag({ noteId });
  const { mutateAsync: setProject } = useSetProject({ noteId });

  const [name, setName] = useState(note.name);
  const [content, setContent] = useState(note.content);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);

  // Switching to a different note: reset local state from the freshly
  // loaded note instead of carrying over the previous note's edits.
  useEffect(() => {
    setName(note.name);
    setContent(note.content);
    isFirstRender.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Debounced autosave: skip the render that just synced from `note` above,
  // save `AUTOSAVE_DELAY_MS` after the user stops typing otherwise. Known
  // tradeoff: navigating to a different note within the debounce window
  // discards the pending save rather than flushing it (the cleanup below
  // clears it as part of resetting state for the new note) -- acceptable
  // for a single-user app; a save-on-route-change flush would need the old
  // note's id/updateNote captured separately since this effect's own
  // closures are already bound to the new note by the time it runs.
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

  const remove = async () => {
    try {
      await deleteNote();
      navigate({ to: "/notes" });
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to delete note" });
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* The Layout mobile header already has its own trigger; this one is
              for desktop, where that bar is hidden. */}
          <SidebarTrigger className="hidden md:inline-flex" />
          <Link
            to="/notes"
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
            <Trash2Icon /> Delete
          </Button>
        </div>
      </div>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-auto border-transparent bg-transparent px-0 text-lg font-semibold hover:border-input hover:bg-input/20 focus-visible:border-input focus-visible:bg-input/20"
      />

      <div className="flex flex-col gap-3">
        <NoteReminderList noteId={note.id} reminders={note.reminders} difficulty={difficulty} />

        <Separator />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <PropertyGroup label="Difficulty">
            <DifficultySelector noteId={note.id} difficulty={difficulty} />
          </PropertyGroup>
          <Separator orientation="vertical" className="h-4" />
          <PropertyGroup label="Project">
            <ProjectPicker
              value={project}
              onChange={(next) => setProject(next?.id ?? null)}
              onProjectClick={(proj) => navigate({ to: "/notes", search: { projectId: proj.id } })}
              compact
            />
          </PropertyGroup>
          <Separator orientation="vertical" className="h-4" />
          <PropertyGroup label="Tags">
            <TagPicker selectedTags={regularTags} onToggle={toggleTag} compact />
          </PropertyGroup>
        </div>
      </div>

      <MarkdownEditor markdown={content} onChange={setContent} />
    </div>
  );
}
