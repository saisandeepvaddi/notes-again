import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Link, useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
import { DifficultySelector } from "./DifficultySelector";
import { getDifficulty } from "./difficulty";
import { useAttachTag } from "./hooks/useAttachTag";
import { useDeleteNote } from "./hooks/useDeleteNote";
import { useDetachTag } from "./hooks/useDetachTag";
import type { NoteItem, Tag } from "./new-note-form/types";
import { NoteContent } from "./NoteContent";
import { NoteReminderList } from "./NoteReminderList";
import { TagPicker } from "./TagPicker";

interface NoteCardProps {
  note: NoteItem;
}

export function NoteCard({ note }: NoteCardProps) {
  const navigate = useNavigate();
  const { mutateAsync: deleteNote } = useDeleteNote({
    noteId: note.id,
  });
  const { mutateAsync: attachTag } = useAttachTag({ noteId: note.id });
  const { mutateAsync: detachTag } = useDetachTag({ noteId: note.id });
  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const toggleTag = (tag: Tag) => {
    if (note.tags.some((attached) => attached.id === tag.id)) {
      detachTag(tag.id);
    } else {
      attachTag(tag.id);
    }
  };
  const goToTag = (tag: Tag) => navigate({ to: "/notes", search: { tagId: tag.id } });
  return (
    <Card className="h-fit">
      <CardHeader className="flex items-center justify-between gap-2">
        <h2 className="truncate font-semibold text-sm">
          <Link
            to="/notes/$noteId"
            params={{ noteId: String(note.id) }}
            className="hover:underline"
          >
            {note.name}
          </Link>
        </h2>
        <Button
          size="icon-xs"
          onClick={() => deleteNote()}
          variant="ghost"
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/card:opacity-100"
        >
          <Trash2Icon />
        </Button>
      </CardHeader>
      <CardContent>
        <Link
          to="/notes/$noteId"
          params={{ noteId: String(note.id) }}
          className="relative block max-h-28 overflow-hidden"
        >
          <NoteContent markdown={note.content} className="text-xs" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent" />
        </Link>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <NoteReminderList reminders={note.reminders} />
        <div className="flex flex-wrap items-center gap-2">
          <DifficultySelector noteId={note.id} difficulty={getDifficulty(note.tags)} />
          <TagPicker selectedTags={regularTags} onToggle={toggleTag} onTagClick={goToTag} />
        </div>
      </CardFooter>
    </Card>
  );
}
