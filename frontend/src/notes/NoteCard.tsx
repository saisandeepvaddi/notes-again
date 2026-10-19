import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderIcon, TrashIcon } from "@phosphor-icons/react";

import { useDeleteNote } from "./hooks/useDeleteNote";
import type { NoteItem, Project, Tag } from "./new-note-form/types";
import { NoteContent } from "./NoteContent";
import { NoteReminderList } from "./NoteReminderList";
import { reviewStatusOf } from "./reviewStatus";
import { NoteTitle, noteTitleText } from "./NoteTitle";
import { SelectCheckbox, selectionClickCapture } from "./selection/SelectCheckbox";

const MAX_VISIBLE_TAGS = 2;

export interface CardSelection {
  selected: boolean;
  selecting: boolean;
  onToggle: (range: boolean) => void;
}

interface NoteCardProps {
  note: NoteItem;
  select?: CardSelection;
}

export function NoteCard({ note, select }: NoteCardProps) {
  const navigate = useNavigate();
  const { mutateAsync: deleteNote } = useDeleteNote({ noteId: note.id });
  const titleText = noteTitleText(note.name);
  const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
  const visibleTags = regularTags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTags = regularTags.slice(MAX_VISIBLE_TAGS);
  const project = note.project ?? null;
  const goToTag = (tag: Tag) =>
    navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: tag.id }) });
  const goToProject = (proj: Project) =>
    navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: proj.id }) });

  return (
    <Card
      className={cn(
        "group/card h-72",
        select?.selected && "bg-primary/5 ring-2 ring-primary",
        select?.selecting && "cursor-pointer",
      )}
      data-selecting={select?.selecting ?? false}
      onClickCapture={select && selectionClickCapture(select.selecting, select.onToggle)}
    >
      <CardHeader className="relative flex shrink-0 items-center">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/notes/$noteId"
                params={{ noteId: String(note.id) }}
                aria-label={titleText}
                className="peer absolute inset-0"
              />
            }
          />
          <TooltipContent>{titleText}</TooltipContent>
        </Tooltip>
        <h2 className="min-w-0 flex-1 truncate font-reading text-sm font-semibold tracking-tight peer-hover:underline [@media(hover:none)]:pr-12">
          <NoteTitle title={note.name} />
        </h2>
        <div className="absolute inset-y-0 right-(--card-spacing) z-10 flex items-center gap-1 bg-linear-to-l from-card from-75% to-transparent pl-6 opacity-0 transition-opacity group-hover/card:opacity-100 group-data-[selecting=true]/card:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {select && (
            <SelectCheckbox
              label={`Select ${titleText}`}
              checked={select.selected}
              onToggle={select.onToggle}
            />
          )}
          <Button
            size="icon-xs"
            onClick={() => deleteNote()}
            variant="ghost"
            aria-label="Delete note"
            className="text-muted-foreground hover:text-destructive"
          >
            <TrashIcon />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <Link
          to="/notes/$noteId"
          params={{ noteId: String(note.id) }}
          className="relative block h-full overflow-hidden"
        >
          <NoteContent
            markdown={note.content}
            className="text-xs [&_pre]:overflow-x-hidden [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent" />
        </Link>
      </CardContent>
      <CardFooter className="flex shrink-0 flex-col items-start gap-1.5 overflow-hidden">
        <NoteReminderList
          noteId={note.id}
          reminders={note.reminders}
          status={reviewStatusOf(note)}
          compact
        />
        <div className="flex w-full flex-nowrap items-center gap-1.5 overflow-hidden">
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
                    <span className="min-w-0 max-w-28 truncate">{tag.name}</span>
                  </Badge>
                }
              />
              <TooltipContent>{tag.name}</TooltipContent>
            </Tooltip>
          ))}
          {hiddenTags.length > 0 && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="outline" className="shrink-0 cursor-default">
                    +{hiddenTags.length}
                  </Badge>
                }
              />
              <TooltipContent>{hiddenTags.map((tag) => tag.name).join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
