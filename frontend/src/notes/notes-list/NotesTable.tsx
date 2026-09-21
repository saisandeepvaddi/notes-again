import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Link, useNavigate } from "@tanstack/react-router";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, FolderIcon, Trash2Icon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, getDifficulty } from "../difficulty";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { markdownExcerpt } from "../markdownExcerpt";
import { NoteReminderList } from "../NoteReminderList";
import type { NoteItem, Project } from "../new-note-form/types";
import { SelectCheckbox, selectionClickCapture } from "../selection/SelectCheckbox";
import type { NoteSelection } from "../selection/useNoteSelection";
import type { NotesSort, NotesSortOrder } from "./useInfiniteNotes";

const columnHelper = createColumnHelper<NoteItem>();

// Sort key for the "Reviews" column: soonest-due first. Every note has
// exactly one pending reminder, so this is effectively "review this next".
function nextReviewTimestamp(note: NoteItem): number {
  const pending = note.reminders.find((reminder) => reminder.reviewed_at == null);
  return pending ? pending.remind_at.getTime() : Number.POSITIVE_INFINITY;
}

const MAX_VISIBLE_TAGS = 2;

function ProjectCell({ project }: { project: Project | null | undefined }) {
  const navigate = useNavigate();
  if (!project) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <FolderIcon className="size-3" />
      <button
        type="button"
        onClick={() => navigate({ to: "/notes", search: { projectId: project.id } })}
        className="hover:underline"
      >
        {project.name}
      </button>
    </Badge>
  );
}

function DeleteRowButton({ noteId }: { noteId: number }) {
  const { mutate: deleteNote, isPending } = useDeleteNote({ noteId });
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Delete note"
      disabled={isPending}
      className="text-muted-foreground hover:text-destructive"
      onClick={(e) => {
        e.stopPropagation();
        deleteNote();
      }}
    >
      <Trash2Icon />
    </Button>
  );
}

const columns = [
  columnHelper.accessor("name", {
    header: "Note",
    cell: (info) => (
      // Stretched-link pattern: the ::after pseudo-element covers the whole
      // cell (relative to this wrapper), so clicking anywhere in the Note
      // column opens the note, not just the text itself.
      <div className="relative">
        <Link
          to="/notes/$noteId"
          params={{ noteId: String(info.row.original.id) }}
          className="font-serif font-medium after:absolute after:inset-0 hover:underline"
        >
          {info.getValue()}
        </Link>
      </div>
    ),
  }),
  columnHelper.display({
    id: "preview",
    header: "Preview",
    enableSorting: false,
    cell: (info) => {
      const excerpt = markdownExcerpt(info.row.original.content);
      return (
        <span className="block max-w-[36ch] truncate text-muted-foreground" title={excerpt}>
          {excerpt || "—"}
        </span>
      );
    },
  }),
  columnHelper.accessor((note) => note.project?.name ?? "", {
    id: "project",
    header: "Project",
    cell: (info) => <ProjectCell project={info.row.original.project} />,
  }),
  columnHelper.display({
    id: "tags",
    header: "Tags",
    enableSorting: false,
    cell: (info) => {
      const note = info.row.original;
      const difficulty = getDifficulty(note.tags);
      const regularTags = note.tags.filter((tag) => !tag.is_difficulty);
      const visible = regularTags.slice(0, MAX_VISIBLE_TAGS);
      const overflow = regularTags.length - visible.length;
      return (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className={cn("capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}>
            {difficulty}
          </Badge>
          {visible.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
          {overflow > 0 && <Badge variant="outline">+{overflow}</Badge>}
        </div>
      );
    },
  }),
  columnHelper.accessor((note) => nextReviewTimestamp(note), {
    id: "reminders",
    header: "Reviews",
    cell: (info) => {
      const note = info.row.original;
      return <NoteReminderList noteId={note.id} reminders={note.reminders} />;
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    enableSorting: false,
    cell: (info) => <DeleteRowButton noteId={info.row.original.id} />,
  }),
];

// Column id -> the server-side sort key it maps to.
const SORT_KEYS: Record<string, NotesSort> = {
  name: "name",
  project: "project",
  reminders: "due",
};

// Fixed layout + explicit widths: with virtualization only the rows near the
// viewport exist, so auto layout would resize columns as different rows
// scroll into view.
const COLUMN_WIDTHS: Record<string, string> = {
  name: "w-[20%]",
  preview: "w-[22%]",
  project: "w-[12%]",
  tags: "w-[16%]",
  reminders: "w-[26%]",
  actions: "w-10",
};

const ESTIMATED_ROW_HEIGHT = 57;

interface NotesTableProps {
  notes: NoteItem[];
  sort: NotesSort;
  order: NotesSortOrder;
  onSortChange: (sort: NotesSort) => void;
  selection: NoteSelection;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export function NotesTable({
  notes,
  sort,
  order,
  onSortChange,
  selection,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: NotesTableProps) {
  // See VirtualNoteGrid: the React Compiler breaks TanStack Virtual (and
  // TanStack Table's mutable instance) -- opt this component out.
  "use no memo";
  // Sorting is done by the server (the list is paged), so the table only
  // *displays* the current sort rather than performing it.
  const sorting: SortingState = Object.entries(SORT_KEYS)
    .filter(([, key]) => key === sort)
    .map(([id]) => ({ id, desc: order === "desc" }));

  const table = useReactTable({
    data: notes,
    columns,
    state: { sorting },
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const allLoadedSelected = notes.length > 0 && notes.every((note) => selection.isSelected(note.id));

  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY;
    if (Math.abs(top - scrollMargin) > 0.5) setScrollMargin(top);
  });

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    scrollMargin,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const virtualRows = virtualizer.getVirtualItems();
  // Spacer rows stand in for everything that isn't mounted.
  const paddingTop = virtualRows.length ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin)
    : 0;

  const lastRow = virtualRows[virtualRows.length - 1]?.index ?? -1;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastRow >= rows.length - 5) {
      fetchNextPage();
    }
  }, [lastRow, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <Table className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              <TableHead className="w-10">
                <SelectCheckbox
                  label="Select all loaded notes"
                  checked={allLoadedSelected}
                  indeterminate={selection.count > 0 && !allLoadedSelected}
                  onToggle={() =>
                    selection.count > 0 ? selection.clear() : selection.replace(notes.map((n) => n.id))
                  }
                />
              </TableHead>
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className={COLUMN_WIDTHS[header.column.id]}>
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={() => onSortChange(SORT_KEYS[header.column.id])}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDirection === "asc" ? (
                          <ArrowUpIcon className="size-3" />
                        ) : sortDirection === "desc" ? (
                          <ArrowDownIcon className="size-3" />
                        ) : (
                          <ChevronsUpDownIcon className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody ref={bodyRef}>
          {paddingTop > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length + 1} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const noteId = row.original.id;
            const selected = selection.isSelected(noteId);
            const toggle = (range: boolean) => selection.toggle(noteId, range);
            return (
              <TableRow
                key={row.id}
                data-index={virtualRow.index}
                data-state={selected ? "selected" : undefined}
                className={cn(selection.selectionMode && "cursor-pointer")}
                onClickCapture={selectionClickCapture(selection.selectionMode, toggle)}
                ref={virtualizer.measureElement}
              >
                <TableCell>
                  <SelectCheckbox
                    label={`Select ${row.original.name}`}
                    checked={selected}
                    onToggle={toggle}
                  />
                </TableCell>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length + 1} style={{ height: paddingBottom }} />
            </tr>
          )}
        </TableBody>
      </Table>
      {isFetchingNextPage && (
        <div className="flex justify-center border-t py-3 text-muted-foreground">
          <Spinner />
        </div>
      )}
    </div>
  );
}
