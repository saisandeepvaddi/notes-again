import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";
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
        <h2 className="truncate font-semibold text-sm">{note.name}</h2>
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
        <div className="relative max-h-28 overflow-hidden">
          <NoteContent markdown={note.content} className="text-xs" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent" />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <NoteReminderList reminders={note.reminders} />
        <TagPicker selectedTags={note.tags} onToggle={toggleTag} onTagClick={goToTag} />
      </CardFooter>
    </Card>
  );
}
