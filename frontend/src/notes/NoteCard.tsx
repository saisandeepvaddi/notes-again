import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderIcon, Trash2Icon } from "lucide-react";
import { DIFFICULTY_BADGE_CLASSES, getDifficulty } from "./difficulty";
import { useDeleteNote } from "./hooks/useDeleteNote";
import type { NoteItem, Project, Tag } from "./new-note-form/types";
import { NoteContent } from "./NoteContent";
import { NoteReminderList } from "./NoteReminderList";

const MAX_VISIBLE_TAGS = 2;

interface NoteCardProps {
  note: NoteItem;
}

// Read-only by design -- no inline "add a tag"/"add a project" controls
// here. Changing a note's tags/project/difficulty happens on its own page
// (which reuses the note form), not from the grid.
export function NoteCard({ note }: NoteCardProps) {
  const navigate = useNavigate();
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId: note.id });
  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const visibleTags = regularTags.slice(0, MAX_VISIBLE_TAGS);
  const overflowTags = regularTags.length - visibleTags.length;
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);
  const goToTag = (tag: Tag) => navigate({ to: "/notes", search: { tagId: tag.id } });
  const goToProject = (proj: Project) => navigate({ to: "/notes", search: { projectId: proj.id } });

  return (
    <Card className="group/card h-fit">
      <CardHeader className="relative flex items-center justify-between gap-2">
        <h2 className="truncate font-semibold text-sm">
          {/* Stretched-link pattern: the ::after pseudo-element covers the
              whole header (relative to it), so the entire bar is clickable,
              not just this text -- while staying a real <a> (middle-click,
              "open in new tab", etc. all still work). The delete button
              sits above it (relative + z-10) so it stays independently
              clickable instead of the stretched link swallowing the click. */}
          <Link
            to="/notes/$noteId"
            params={{ noteId: String(note.id) }}
            className="after:absolute after:inset-0 hover:underline"
          >
            {note.name}
          </Link>
        </h2>
        <Button
          size="icon-xs"
          onClick={() => deleteNote()}
          variant="ghost"
          aria-label="Delete note"
          className="relative z-10 shrink-0 text-muted-foreground hover:text-destructive"
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
      <CardFooter className="flex flex-col items-start gap-1.5">
        <NoteReminderList
          noteId={note.id}
          reminders={note.reminders}
          difficulty={difficulty}
          compact
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}>
            {difficulty}
          </Badge>
          {project && (
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1"
              onClick={() => goToProject(project)}
            >
              <FolderIcon className="size-2.5" />
              {project.name}
            </Badge>
          )}
          {visibleTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="cursor-pointer"
              onClick={() => goToTag(tag)}
            >
              {tag.name}
            </Badge>
          ))}
          {overflowTags > 0 && <Badge variant="outline">+{overflowTags}</Badge>}
        </div>
      </CardFooter>
    </Card>
  );
}
