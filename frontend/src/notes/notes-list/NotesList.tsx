import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isNone } from "@/utils/general";
import { useNavigate } from "@tanstack/react-router";
import { format, isToday } from "date-fns";
import { FolderIcon, LayoutGridIcon, TableIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useProjects } from "../hooks/useProjects";
import { NoteCard } from "../NoteCard";
import { NoteGrid } from "../NoteGrid";
import { TagFilterBar } from "../TagFilterBar";
import { NotesTable } from "./NotesTable";
import { useNotes } from "./useNotes";
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
  const { data: notes } = useNotes({
    date: noteDate,
    tagId,
    projectId,
  });
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
      {notes.length === 0 ? (
        <p className="text-muted-foreground">No notes yet.</p>
      ) : effectiveMode === "table" ? (
        <NotesTable notes={notes} />
      ) : (
        <NoteGrid>
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </NoteGrid>
      )}
    </div>
  );
}

export default NotesList;
