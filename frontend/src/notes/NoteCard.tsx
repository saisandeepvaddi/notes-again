import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderIcon, Trash2Icon } from "lucide-react";
import { DIFFICULTY_BADGE_CLASSES, getDifficulty } from "./difficulty";
import { useDeleteNote } from "./hooks/useDeleteNote";
import type { NoteItem, Project, Tag } from "./new-note-form/types";
import { NoteContent } from "./NoteContent";
import { NoteReminderList } from "./NoteReminderList";
import { SelectCheckbox, selectionClickCapture } from "./selection/SelectCheckbox";

const MAX_VISIBLE_TAGS = 2;

export interface CardSelection {
  selected: boolean;
  // Anything (not just this note) is selected, so clicks toggle rather than open.
  selecting: boolean;
  onToggle: (range: boolean) => void;
}

interface NoteCardProps {
  note: NoteItem;
  select?: CardSelection;
}

// Read-only by design -- no inline "add a tag"/"add a project" controls
// here. Changing a note's tags/project/difficulty happens on its own page
// (which reuses the note form), not from the grid.
export function NoteCard({ note, select }: NoteCardProps) {
  const navigate = useNavigate();
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId: note.id });
  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const visibleTags = regularTags.slice(0, MAX_VISIBLE_TAGS);
  const overflowTags = regularTags.length - visibleTags.length;
  const project = note.project ?? null;
  const difficulty = getDifficulty(note.tags);
  // Merge, not replace: picking a tag/project here shouldn't drop the other
  // active filter — see TagFilterBar's goToTag for the same fix.
  const goToTag = (tag: Tag) =>
    navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: tag.id }) });
  const goToProject = (proj: Project) =>
    navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: proj.id }) });

  return (
    <Card
      className={cn(
        // Fixed height, not h-fit: every card in the grid is the same size
        // regardless of how much its content/name/tags run on, so rows line
        // up instead of leaving ragged gaps. Overflow in any section (a
        // 2-line badge row, a long single-word title that can't wrap) is
        // clipped by the base Card's own overflow-hidden rather than
        // growing the card.
        "group/card h-72",
        select?.selected && "bg-primary/5 ring-2 ring-primary",
        select?.selecting && "cursor-pointer",
      )}
      data-selecting={select?.selecting ?? false}
      onClickCapture={select && selectionClickCapture(select.selecting, select.onToggle)}
    >
      <CardHeader className="relative flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {select && (
            <SelectCheckbox
              revealOnHover
              label={`Select ${note.name}`}
              checked={select.selected}
              onToggle={select.onToggle}
            />
          )}
          <Tooltip>
            {/* Stretched-link pattern: the ::after pseudo-element covers the
                whole header (relative to it), so the entire bar is clickable,
                not just this text -- while staying a real <a> (middle-click,
                "open in new tab", etc. all still work). The delete button
                sits above it (relative + z-10) so it stays independently
                clickable instead of the stretched link swallowing the click. */}
            <TooltipTrigger
              render={
                <h2 className="min-w-0 truncate font-serif font-semibold text-sm">
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: String(note.id) }}
                    className="after:absolute after:inset-0 hover:underline"
                  >
                    {note.name}
                  </Link>
                </h2>
              }
            />
            <TooltipContent>{note.name}</TooltipContent>
          </Tooltip>
        </div>
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
      <CardContent className="min-h-0 flex-1">
        <Link
          to="/notes/$noteId"
          params={{ noteId: String(note.id) }}
          className="relative block h-full overflow-hidden"
        >
          <NoteContent markdown={note.content} className="text-xs" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent" />
        </Link>
      </CardContent>
      <CardFooter className="flex shrink-0 flex-col items-start gap-1.5 overflow-hidden">
        <NoteReminderList noteId={note.id} reminders={note.reminders} compact />
        {/* w-full: CardFooter is items-start (cross-axis = width here, since
            it's a flex column), so without an explicit width this row would
            just size to its content and never shrink -- the badges would
            keep growing until the card's own overflow-hidden hard-clipped
            them mid-badge instead of them truncating cleanly. */}
        <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-hidden">
          <Badge
            variant="outline"
            className={cn("shrink-0 capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}
          >
            {difficulty}
          </Badge>
          {project && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="secondary"
                    className="min-w-0 shrink cursor-pointer gap-1"
                    onClick={() => goToProject(project)}
                  >
                    <FolderIcon className="size-2.5 shrink-0" />
                    <span className="min-w-0 max-w-20 truncate">{project.name}</span>
                  </Badge>
                }
              />
              <TooltipContent>{project.name}</TooltipContent>
            </Tooltip>
          )}
          {visibleTags.map((tag) => (
            <Tooltip key={tag.id}>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="min-w-0 shrink cursor-pointer"
                    onClick={() => goToTag(tag)}
                  >
                    <span className="min-w-0 max-w-20 truncate">{tag.name}</span>
                  </Badge>
                }
              />
              <TooltipContent>{tag.name}</TooltipContent>
            </Tooltip>
          ))}
          {overflowTags > 0 && <Badge variant="outline" className="shrink-0">+{overflowTags}</Badge>}
        </div>
      </CardFooter>
    </Card>
  );
}
