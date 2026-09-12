import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, getDifficulty } from "../difficulty";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { markdownExcerpt } from "../markdownExcerpt";
import { NoteReminderList } from "../NoteReminderList";
import type { NoteItem } from "../new-note-form/types";

const columnHelper = createColumnHelper<NoteItem>();

// Sort key for the "Reviews" column: soonest-due first. Every note has
// exactly one pending reminder, so this is effectively "review this next".
function nextReviewTimestamp(note: NoteItem): number {
  const pending = note.reminders.find((reminder) => reminder.reviewed_at == null);
  return pending ? pending.remind_at.getTime() : Number.POSITIVE_INFINITY;
}

const MAX_VISIBLE_TAGS = 2;

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
    sortingFn: "text",
    cell: (info) => (
      <Link
        to="/notes/$noteId"
        params={{ noteId: String(info.row.original.id) }}
        className="font-medium hover:underline"
      >
        {info.getValue()}
      </Link>
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
      const difficulty = getDifficulty(note.tags);
      return <NoteReminderList noteId={note.id} reminders={note.reminders} difficulty={difficulty} />;
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    enableSorting: false,
    cell: (info) => <DeleteRowButton noteId={info.row.original.id} />,
  }),
];

interface NotesTableProps {
  notes: NoteItem[];
}

export function NotesTable({ notes }: NotesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "reminders", desc: false }]);

  const table = useReactTable({
    data: notes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
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
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
