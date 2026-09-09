import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
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
  return (
    <Card>
      <CardHeader className="flex items-center justify-between font-semibold text-xl">
        <h2>{note.name}</h2>
        <Button size="icon-sm" onClick={() => deleteNote()} variant={"destructive"}>
          <Trash2Icon />
        </Button>
      </CardHeader>
      <CardContent>
        <NoteContent markdown={note.content} />
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <NoteReminderList reminders={note.reminders} />
        </div>
        <TagPicker selectedTags={note.tags} onToggle={toggleTag} />
      </CardFooter>
    </Card>
  );
}
