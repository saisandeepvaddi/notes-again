import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, FolderIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DifficultySelector } from "../DifficultySelector";
import { DIFFICULTY_BADGE_CLASSES, getDifficulty } from "../difficulty";
import { useAttachTag } from "../hooks/useAttachTag";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { useDetachTag } from "../hooks/useDetachTag";
import { useNote } from "../hooks/useNote";
import { useSetProject } from "../hooks/useSetProject";
import { useUpdateNote } from "../hooks/useUpdateNote";
import { MarkdownEditor } from "../MarkdownEditor";
import type { Tag } from "../new-note-form/types";
import { NoteContent } from "../NoteContent";
import { NoteReminderList } from "../NoteReminderList";
import { ProjectPicker } from "../ProjectPicker";
import { TagPicker } from "../TagPicker";

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

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(note.name);
  const [content, setContent] = useState(note.content);
  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);

  const toggleTag = (tag: Tag) => {
    if (note.tags.some((attached) => attached.id === tag.id)) {
      detachTag(tag.id);
    } else {
      attachTag(tag.id);
    }
  };

  const startEditing = () => {
    setName(note.name);
    setContent(note.content);
    setIsEditing(true);
  };

  const save = async () => {
    try {
      await updateNote({ name, content });
      setIsEditing(false);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to save note" });
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
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={startEditing}>
                <PencilIcon /> Edit
              </Button>
              <Button size="sm" variant="destructive" onClick={remove}>
                <Trash2Icon /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-semibold"
        />
      ) : (
        <h1 className="text-lg font-semibold">{note.name}</h1>
      )}

      <div className="flex flex-col gap-2">
        <NoteReminderList noteId={note.id} reminders={note.reminders} difficulty={difficulty} />
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-2">
            <DifficultySelector noteId={note.id} difficulty={difficulty} />
            <ProjectPicker value={project} onChange={(next) => setProject(next?.id ?? null)} />
            <TagPicker selectedTags={regularTags} onToggle={toggleTag} />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}
            >
              {difficulty}
            </Badge>
            {project && (
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1"
                onClick={() => navigate({ to: "/notes", search: { projectId: project.id } })}
              >
                <FolderIcon className="size-2.5" />
                {project.name}
              </Badge>
            )}
            {regularTags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="cursor-pointer"
                onClick={() => navigate({ to: "/notes", search: { tagId: tag.id } })}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {isEditing ? (
        <MarkdownEditor markdown={content} onChange={setContent} />
      ) : (
        <NoteContent markdown={note.content} />
      )}
    </div>
  );
}
