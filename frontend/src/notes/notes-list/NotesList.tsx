import { NoteGridSkeleton, NoteTableSkeleton } from "@/components/PageSkeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { isNone } from "@/utils/general";
import { useNavigate } from "@tanstack/react-router";
import { format, isToday, parseISO } from "date-fns";
import { FolderIcon, LayoutGridIcon, SearchIcon, TableIcon, XIcon } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useEffect, useRef, useState } from "react";
import { useProjects } from "../hooks/useProjects";
import { NoteCard } from "../NoteCard";
import { REVIEW_STATUS_LABELS } from "../reviewStatus";
import { fetchNoteIds } from "../selection/fetchNoteIds";
import { NotesSelectionActions } from "../selection/NotesSelectionActions";
import { SelectionBar } from "../selection/SelectionBar";
import { useNoteSelection } from "../selection/useNoteSelection";
import { TagFilterBar } from "../TagFilterBar";
import { VirtualNoteGrid } from "../VirtualNoteGrid";
import { NotesTable } from "./NotesTable";
import {
  useInfiniteNotes,
  usePagedNotes,
  type NotesSort,
  type NotesSortOrder,
  type NotesStatus,
} from "./useInfiniteNotes";
import { useNotesViewMode, type NotesViewMode } from "./useNotesViewMode";

export const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_SORT: { key: NotesSort; order: NotesSortOrder } = { key: "due", order: "asc" };
const DATE_PARAM_FORMAT = "yyyy-MM-dd";

interface NotesListProps {
  tagId?: number;
  projectId?: number;
  date?: string;
  search?: string;
  status?: NotesStatus;
  sort?: NotesSort;
  order?: NotesSortOrder;
  page?: number;
  pageSize?: number;
}

const STATUS_OPTIONS: { value: NotesStatus | undefined; label: string; title: string }[] = [
  { value: undefined, label: "All", title: "All notes" },
  { value: "active", label: REVIEW_STATUS_LABELS.active, title: "Notes in review" },
  {
    value: "paused",
    label: REVIEW_STATUS_LABELS.paused,
    title: "Notes kept out of review for now",
  },
  {
    value: "note-only",
    label: REVIEW_STATUS_LABELS["note-only"],
    title: "Plain notes that aren't part of review",
  },
];

function StatusFilter({
  status,
  onChange,
}: {
  status: NotesStatus | undefined;
  onChange: (status: NotesStatus | undefined) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border p-0.5"
      role="group"
      aria-label="Review status"
    >
      {STATUS_OPTIONS.map((option) => (
        <Button
          key={option.label}
          type="button"
          size="sm"
          variant="ghost"
          title={option.title}
          aria-pressed={status === option.value}
          className={cn(status === option.value && "bg-muted text-foreground")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
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

function NotesList({
  tagId,
  projectId,
  date,
  search,
  status,
  sort,
  order,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: NotesListProps) {
  const noteDate = date ? parseISO(date) : undefined;
  const [mode, setMode] = useNotesViewMode();
  const isMobile = useIsMobile();
  const effectiveMode = isMobile ? "grid" : mode;
  const { data: projects = [] } = useProjects();
  const navigate = useNavigate();
  const setNoteDate = (next: Date | undefined) =>
    navigate({
      to: "/notes",
      search: (prev) => ({ ...prev, date: next && format(next, DATE_PARAM_FORMAT) }),
    });
  const activeProject = projects.find((project) => project.id === projectId);
  const sortKey = sort ?? DEFAULT_SORT.key;
  const sortOrder = sort ? (order ?? "asc") : DEFAULT_SORT.order;

  const [searchInput, setSearchInput] = useState(search ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setSearchInput(search ?? ""), [search]);
  const onSearchInput = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      navigate({
        to: "/notes",
        search: (prev) => ({ ...prev, q: value.trim() || undefined }),
        replace: true,
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const filters = { date: noteDate, tagId, projectId, search, status };
  const infinite = useInfiniteNotes("notes", {
    ...filters,
    sort: sortKey,
    order: sortOrder,
    enabled: effectiveMode !== "table",
  });
  const paged = usePagedNotes("notes", {
    ...filters,
    sort: sortKey,
    order: sortOrder,
    page,
    pageSize,
    enabled: effectiveMode === "table",
  });
  const { notes, total, isPending, isError, isPlaceholderData } =
    effectiveMode === "table" ? paged : infinite;
  const paging = {
    hasNextPage: infinite.hasNextPage,
    isFetchingNextPage: infinite.isFetchingNextPage,
    fetchNextPage: infinite.fetchNextPage,
  };
  const pagination = {
    page,
    pageSize,
    total,
    onPageChange: (nextPage: number) =>
      navigate({ to: "/notes", search: (prev) => ({ ...prev, page: nextPage }) }),
    onPageSizeChange: (nextSize: number) =>
      navigate({
        to: "/notes",
        search: (prev) => ({ ...prev, pageSize: nextSize, page: undefined }),
      }),
  };
  const selection = useNoteSelection(notes.map((note) => note.id));
  const { clear: clearSelection } = selection;
  useEffect(() => {
    clearSelection();
  }, [tagId, projectId, date, search, status]);
  const selectAll = async () => {
    const { ids, total: matching } = await fetchNoteIds({
      date: noteDate,
      tagId,
      projectId,
      search,
      status,
    });
    selection.replace(ids);
    if (ids.length < matching) {
      toast.add({
        description: `Selected the first ${ids.length.toLocaleString()} of ${matching.toLocaleString()} notes`,
      });
    }
  };
  const onSortChange = (key: NotesSort) =>
    navigate({
      to: "/notes",
      search: (prev) => {
        if (sort !== key) return { ...prev, sort: key, order: undefined };
        return sortOrder === "asc"
          ? { ...prev, sort: key, order: "desc" }
          : { ...prev, sort: undefined, order: undefined };
      },
    });
  return (
    <div className="flex flex-col gap-4">
      {activeProject && (
        <Badge variant="secondary" className="w-fit gap-1">
          <FolderIcon className="size-3" />
          {activeProject.name}
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: undefined }) })
            }
            className="opacity-60 hover:opacity-100"
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagFilterBar activeTagId={tagId} />
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search notes..."
              className="h-8 w-40 pl-7 sm:w-56"
              aria-label="Search notes"
            />
          </div>
          {isNone(noteDate) ? (
            <Button size="sm" variant="outline" onClick={() => setNoteDate(new Date())}>
              Show only today
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setNoteDate(undefined)}>
              Show All (currently: {isToday(noteDate) ? "today" : format(noteDate, "MMM d")})
            </Button>
          )}
          <StatusFilter
            status={status}
            onChange={(next) =>
              navigate({
                to: "/notes",
                search: (prev) => ({ ...prev, status: next }),
              })
            }
          />
          {!isMobile && <ViewModeToggle mode={mode} onChange={setMode} />}
        </div>
      </div>
      {isPending ? (
        effectiveMode === "table" ? (
          <NoteTableSkeleton />
        ) : (
          <NoteGridSkeleton />
        )
      ) : isError ? (
        <p className="text-destructive">Couldn't load notes.</p>
      ) : notes.length === 0 ? (
        <p className="text-muted-foreground">
          {tagId != null || projectId != null || noteDate != null || search || status
            ? "No notes match this filter."
            : "No notes yet — capture one with New Note above, or from the browser extension."}
        </p>
      ) : (
        <>
          {effectiveMode !== "table" && (
            <p className="text-xs text-muted-foreground">
              {notes.length < total
                ? `Showing ${notes.length.toLocaleString()} of ${total.toLocaleString()} notes`
                : `${total.toLocaleString()} note${total === 1 ? "" : "s"}`}
            </p>
          )}
          <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
            {effectiveMode === "table" ? (
              <NotesTable
                notes={notes}
                sort={sort}
                order={sortOrder}
                onSortChange={onSortChange}
                selection={selection}
                pagination={pagination}
                activeProjectId={projectId}
                activeTagId={tagId}
              />
            ) : (
              <VirtualNoteGrid
                items={notes}
                renderItem={(note) => (
                  <NoteCard
                    note={note}
                    select={{
                      selected: selection.isSelected(note.id),
                      selecting: selection.selectionMode,
                      onToggle: (range) => selection.toggle(note.id, range),
                    }}
                  />
                )}
                {...paging}
              />
            )}
          </div>
        </>
      )}
      {selection.selectionMode && (
        <SelectionBar
          count={selection.count}
          total={total}
          onSelectAll={selectAll}
          onClear={selection.clear}
        >
          <NotesSelectionActions
            ids={selection.ids}
            count={selection.count}
            onDone={selection.clear}
          />
        </SelectionBar>
      )}
    </div>
  );
}

export default NotesList;
