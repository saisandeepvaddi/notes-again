import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isNone } from "@/utils/general";
import { useNavigate } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { FolderIcon, LayoutGridIcon, TableIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useProjects } from "../hooks/useProjects";
import { NoteCard } from "../NoteCard";
import { TagFilterBar } from "../TagFilterBar";
import { VirtualNoteGrid } from "../VirtualNoteGrid";
import { NotesTable } from "./NotesTable";
import { useInfiniteNotes, type NotesSort, type NotesSortOrder } from "./useInfiniteNotes";
import { useNotesViewMode, type NotesViewMode } from "./useNotesViewMode";

interface NotesListProps {
  tagId?: number;
  projectId?: number;
  initialDate?: Date;
}

interface ViewModeToggleProps {
  mode: NotesViewMode;
  onChange: (mode: NotesViewMode) => void;
}

function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border p-0.5">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Grid view"
        aria-pressed={mode === "grid"}
        className={cn(mode === "grid" && "bg-muted text-foreground")}
        onClick={() => onChange("grid")}
      >
        <LayoutGridIcon />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Table view"
        aria-pressed={mode === "table"}
        className={cn(mode === "table" && "bg-muted text-foreground")}
        onClick={() => onChange("table")}
      >
        <TableIcon />
      </Button>
    </div>
  );
}

function NotesList({ tagId, projectId, initialDate }: NotesListProps) {
  const [noteDate, setNoteDate] = useState<Date | undefined>(initialDate);
  const [mode, setMode] = useNotesViewMode();
  const isMobile = useIsMobile();
  // A data table isn't a mobile-native pattern and there's no room for 6
  // columns on a phone screen -- force the card grid there regardless of
  // the stored preference, and don't offer the toggle at all.
  const effectiveMode = isMobile ? "grid" : mode;
  const { data: projects = [] } = useProjects();
  const navigate = useNavigate();
  const activeProject = projects.find((project) => project.id === projectId);
  // Sorting happens on the server (the list is paged, so a client-side sort
  // would only reorder whatever pages happen to be loaded). Both views share
  // it; the grid just has no headers to change it from.
  const [sort, setSort] = useState<{ key: NotesSort; order: NotesSortOrder }>({
    key: "due",
    order: "asc",
  });
  const {
    notes,
    total,
    isPending,
    isError,
    isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteNotes("notes", {
    date: noteDate,
    tagId,
    projectId,
    sort: sort.key,
    order: sort.order,
  });
  const paging = { hasNextPage, isFetchingNextPage, fetchNextPage };
  const onSortChange = (key: NotesSort) =>
    setSort((current) =>
      current.key === key
        ? { key, order: current.order === "asc" ? "desc" : "asc" }
        : { key, order: "asc" },
    );
  return (
    <div className="flex flex-col gap-4">
      {activeProject && (
        <Badge variant="secondary" className="w-fit gap-1">
          <FolderIcon className="size-3" />
          {activeProject.name}
          <button
            type="button"
            onClick={() => navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: undefined }) })}
            className="opacity-60 hover:opacity-100"
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagFilterBar activeTagId={tagId} />
        <div className="flex items-center gap-2">
          {isNone(noteDate) ? (
            <Button size="sm" variant="outline" onClick={() => setNoteDate(new Date())}>
              Show only today
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setNoteDate(undefined)}>
              Show All (currently: {isToday(noteDate) ? "today" : format(noteDate, "MMM d")})
            </Button>
          )}
          {!isMobile && <ViewModeToggle mode={mode} onChange={setMode} />}
        </div>
      </div>
      {isPending ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner /> Loading notes...
        </div>
      ) : isError ? (
        <p className="text-destructive">Couldn't load notes.</p>
      ) : notes.length === 0 ? (
        <p className="text-muted-foreground">No notes yet.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {notes.length < total
              ? `Showing ${notes.length.toLocaleString()} of ${total.toLocaleString()} notes`
              : `${total.toLocaleString()} note${total === 1 ? "" : "s"}`}
          </p>
          {/* Dimmed (not blanked) while a new filter/sort loads over the old rows. */}
          <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
            {effectiveMode === "table" ? (
              <NotesTable
                notes={notes}
                sort={sort.key}
                order={sort.order}
                onSortChange={onSortChange}
                {...paging}
              />
            ) : (
              <VirtualNoteGrid
                items={notes}
                renderItem={(note) => <NoteCard note={note} />}
                {...paging}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default NotesList;
