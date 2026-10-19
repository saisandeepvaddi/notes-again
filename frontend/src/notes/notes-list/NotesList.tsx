import { NoteGridSkeleton, NoteTableSkeleton } from "@/components/PageSkeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { format, isToday, parseISO } from "date-fns";
import {
  CalendarBlankIcon,
  FolderIcon,
  TagIcon,
  MagnifyingGlassIcon,
  NotebookIcon,
  SquaresFourIcon,
  TableIcon,
  UploadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "@/components/ui/toast";
import { useEffect, useRef, useState } from "react";
import { useProjects } from "../hooks/useProjects";
import { useTags } from "../hooks/useTags";
import { NewNoteButton } from "../NewNoteButton";
import { NoteCard } from "../NoteCard";
import { REVIEW_STATUS_LABELS } from "../reviewStatus";
import { fetchNoteIds } from "../selection/fetchNoteIds";
import { NotesSelectionActions } from "../selection/NotesSelectionActions";
import { SelectionBar } from "../selection/SelectionBar";
import { useNoteSelection } from "../selection/useNoteSelection";
import { VirtualNoteGrid } from "../VirtualNoteGrid";
import { NotesFilters } from "./NotesFilters";
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
        <SquaresFourIcon />
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

function EmptyNotes() {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-6 py-10">
      <NotebookIcon className="size-6 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="font-heading text-base font-semibold tracking-tight">No notes yet</p>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          Write one here, save pages with the browser extension, or bring in an existing deck.
        </p>
      </div>
      <div className="flex gap-2">
        <NewNoteButton />
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link to="/import">
              <UploadSimpleIcon /> Import
            </Link>
          }
        />
      </div>
    </div>
  );
}

function NoMatchingNotes({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-6 py-10">
      <MagnifyingGlassIcon className="size-6 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <h2 className="font-reading text-base font-semibold tracking-tight">No notes match</h2>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Try a different search, or clear the filters to see everything again.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        Clear filters
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
  const { data: tags } = useTags();
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
  const clearFilters = () =>
    navigate({ to: "/notes", search: { sort: prevSort, order: prevOrder, pageSize } });
  const activeTag = tags?.find((tag) => tag.id === tagId);
  const activeFilterChips = [
    activeProject && {
      key: "project",
      icon: <FolderIcon className="size-3" />,
      label: activeProject.name,
      onRemove: () =>
        navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: undefined }) }),
    },
    activeTag && {
      key: "tag",
      icon: <TagIcon className="size-3" />,
      label: activeTag.name,
      onRemove: () => navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: undefined }) }),
    },
    status && {
      key: "status",
      icon: null,
      label: REVIEW_STATUS_LABELS[status],
      onRemove: () =>
        navigate({ to: "/notes", search: (prev) => ({ ...prev, status: undefined }) }),
    },
    noteDate && {
      key: "date",
      icon: <CalendarBlankIcon className="size-3" />,
      label: isToday(noteDate) ? "Today" : format(noteDate, "MMM d"),
      onRemove: () => navigate({ to: "/notes", search: (prev) => ({ ...prev, date: undefined }) }),
    },
  ].filter((chip): chip is NonNullable<typeof chip> => Boolean(chip));
  const prevSort = sort;
  const prevOrder = order;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
            placeholder="Search notes..."
            className="h-8 w-full pr-7 pl-7 sm:w-64"
            aria-label="Search notes"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => onSearchInput("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        <NotesFilters
          status={status}
          tagId={tagId}
          onStatusChange={(next) =>
            navigate({ to: "/notes", search: (prev) => ({ ...prev, status: next }) })
          }
          onTagChange={(next) =>
            navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: next }) })
          }
          onClear={() =>
            navigate({
              to: "/notes",
              search: { sort: prevSort, order: prevOrder, pageSize },
            })
          }
        />
        <Button
          size="sm"
          variant={noteDate ? "secondary" : "outline"}
          onClick={() => setNoteDate(noteDate ? undefined : new Date())}
        >
          <CalendarBlankIcon />
          {noteDate ? (isToday(noteDate) ? "Today" : format(noteDate, "MMM d")) : "Today only"}
        </Button>
        {!isMobile && <ViewModeToggle mode={mode} onChange={setMode} />}
      </div>
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilterChips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1">
              {chip.icon}
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
                className="opacity-60 hover:opacity-100"
              >
                <XIcon className="size-2.5" />
              </button>
            </Badge>
          ))}
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            onClick={clearFilters}
          >
            Clear all
          </Button>
        </div>
      )}
      {isPending ? (
        effectiveMode === "table" ? (
          <NoteTableSkeleton />
        ) : (
          <NoteGridSkeleton />
        )
      ) : isError ? (
        <p className="text-destructive">Couldn't load notes.</p>
      ) : notes.length === 0 ? (
        tagId != null || projectId != null || noteDate != null || search || status ? (
          <NoMatchingNotes
            onClear={() =>
              navigate({
                to: "/notes",
                search: { sort: prevSort, order: prevOrder, pageSize },
              })
            }
          />
        ) : (
          <EmptyNotes />
        )
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
