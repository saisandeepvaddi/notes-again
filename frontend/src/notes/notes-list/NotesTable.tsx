import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpDownIcon,
  FolderIcon,
  FunnelSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS, getDifficulty } from "../difficulty";
import { useDeleteNote } from "../hooks/useDeleteNote";
import { useProjects } from "../hooks/useProjects";
import { useTags } from "../hooks/useTags";
import { markdownExcerpt } from "../markdownExcerpt";
import { NoteReminderList } from "../NoteReminderList";
import { reviewStatusOf } from "../reviewStatus";
import { NoteTitle, noteTitleText } from "../NoteTitle";
import type { NoteItem, Project } from "../new-note-form/types";
import { SelectCheckbox, selectionClickCapture } from "../selection/SelectCheckbox";
import type { NoteSelection } from "../selection/useNoteSelection";
import type { NotesSort, NotesSortOrder } from "./useInfiniteNotes";

const columnHelper = createColumnHelper<NoteItem>();

function nextReviewTimestamp(note: NoteItem): number {
  const pending = note.reminders.find((reminder) => reminder.reviewed_at == null);
  return pending ? pending.remind_at.getTime() : Number.POSITIVE_INFINITY;
}

const MAX_VISIBLE_TAGS = 1;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function ProjectCell({ project }: { project: Project | null | undefined }) {
  const navigate = useNavigate();
  if (!project) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge variant="secondary" className="min-w-0 max-w-full shrink gap-1">
      <FolderIcon className="size-3 shrink-0" />
      <button
        type="button"
        onClick={() =>
          navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: project.id }) })
        }
        className="min-w-0 truncate hover:underline"
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
      <TrashIcon />
    </Button>
  );
}

interface ColumnFilterProps {
  label: string;
  active: boolean;
  placeholder: string;
  options: { id: number; name: string }[];
  onSelect: (id: number | undefined) => void;
  selectedId?: number;
}

function ColumnFilter({
  label,
  active,
  placeholder,
  options,
  onSelect,
  selectedId,
}: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Filter by ${label.toLowerCase()}`}
            className={cn("size-5", active && "text-primary")}
          >
            <FunnelSimpleIcon className="size-3" />
          </Button>
        }
      />
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup>
              {active && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onSelect(undefined);
                    setOpen(false);
                  }}
                >
                  All {label.toLowerCase()}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  data-checked={selectedId === option.id}
                  onSelect={() => {
                    onSelect(option.id);
                    setOpen(false);
                  }}
                >
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const SORT_KEYS: Record<string, NotesSort> = {
  name: "name",
  difficulty: "difficulty",
  project: "project",
  reminders: "due",
};

const COLUMN_WIDTHS: Record<string, string> = {
  name: "w-[20%]",
  preview: "w-[12%]",
  difficulty: "w-[11%]",
  project: "w-[12%]",
  tags: "w-[14%]",
  reminders: "w-[27%]",
  actions: "w-10",
};

interface NotesTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

interface NotesTableProps {
  notes: NoteItem[];
  sort?: NotesSort;
  order: NotesSortOrder;
  onSortChange: (sort: NotesSort) => void;
  selection: NoteSelection;
  pagination: NotesTablePagination;
  activeProjectId?: number;
  activeTagId?: number;
}

export function NotesTable({
  notes,
  sort,
  order,
  onSortChange,
  selection,
  pagination,
  activeProjectId,
  activeTagId,
}: NotesTableProps) {
  "use no memo";
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: allTags = [] } = useTags();
  const tagOptions = allTags.filter((tag) => !tag.is_difficulty);
  const difficultyOptions = DIFFICULTY_OPTIONS.flatMap(({ label }) => {
    const tag = allTags.find(
      (t) => t.is_difficulty && t.name.toLowerCase() === label.toLowerCase(),
    );
    return tag ? [{ id: tag.id, name: label }] : [];
  });
  const difficultyFilterActive = difficultyOptions.some((option) => option.id === activeTagId);
  const tagFilterActive = tagOptions.some((tag) => tag.id === activeTagId);

  const columns = [
    columnHelper.accessor("name", {
      header: "Note",
      cell: (info) => (
        <div className="relative truncate" title={noteTitleText(info.getValue())}>
          <Link
            to="/notes/$noteId"
            params={{ noteId: String(info.row.original.id) }}
            aria-label={noteTitleText(info.getValue())}
            className="peer absolute inset-0"
          />
          <NoteTitle
            title={info.getValue()}
            className="font-reading font-medium peer-hover:underline"
          />
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
    columnHelper.accessor((note) => getDifficulty(note.tags), {
      id: "difficulty",
      header: "Difficulty",
      cell: (info) => {
        const difficulty = getDifficulty(info.row.original.tags);
        return (
          <Badge
            variant="outline"
            className={cn("capitalize", DIFFICULTY_BADGE_CLASSES[difficulty])}
          >
            {difficulty}
          </Badge>
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
        const regularTags = info.row.original.tags.filter((tag) => !tag.is_difficulty);
        const visible = regularTags.slice(0, MAX_VISIBLE_TAGS);
        const hidden = regularTags.slice(MAX_VISIBLE_TAGS);
        if (regularTags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex min-w-0 items-center gap-1">
            {visible.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="min-w-0 max-w-full shrink justify-start"
                title={tag.name}
              >
                <span className="truncate">{tag.name}</span>
              </Badge>
            ))}
            {hidden.length > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Badge variant="outline" className="cursor-default">
                      +{hidden.length}
                    </Badge>
                  }
                />
                <TooltipContent>{hidden.map((tag) => tag.name).join(", ")}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor((note) => nextReviewTimestamp(note), {
      id: "reminders",
      header: "Reviews",
      cell: (info) => {
        const note = info.row.original;
        return (
          <NoteReminderList
            noteId={note.id}
            reminders={note.reminders}
            status={reviewStatusOf(note)}
          />
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: (info) => <DeleteRowButton noteId={info.row.original.id} />,
    }),
  ];

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
  const allLoadedSelected =
    notes.length > 0 && notes.every((note) => selection.isSelected(note.id));

  const { page, pageSize, total, onPageChange, onPageSizeChange } = pagination;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-2">
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
                      selection.count > 0
                        ? selection.clear()
                        : selection.replace(notes.map((n) => n.id))
                    }
                  />
                </TableHead>
                {headerGroup.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  const columnFilter =
                    header.column.id === "project" ? (
                      <ColumnFilter
                        label="Projects"
                        placeholder="Filter by project..."
                        active={activeProjectId != null}
                        selectedId={activeProjectId}
                        options={projects}
                        onSelect={(id) =>
                          navigate({ to: "/notes", search: (prev) => ({ ...prev, projectId: id }) })
                        }
                      />
                    ) : header.column.id === "difficulty" ? (
                      <ColumnFilter
                        label="Difficulties"
                        placeholder="Filter by difficulty..."
                        active={difficultyFilterActive}
                        selectedId={activeTagId}
                        options={difficultyOptions}
                        onSelect={(id) =>
                          navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: id }) })
                        }
                      />
                    ) : header.column.id === "tags" ? (
                      <ColumnFilter
                        label="Tags"
                        placeholder="Filter by tag..."
                        active={tagFilterActive}
                        selectedId={activeTagId}
                        options={tagOptions}
                        onSelect={(id) =>
                          navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId: id }) })
                        }
                      />
                    ) : null;
                  return (
                    <TableHead key={header.id} className={COLUMN_WIDTHS[header.column.id]}>
                      <div className="flex items-center gap-1">
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
                              <CaretUpDownIcon className="size-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                        {columnFilter}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const noteId = row.original.id;
              const selected = selection.isSelected(noteId);
              const toggle = (range: boolean) => selection.toggle(noteId, range);
              return (
                <TableRow
                  key={row.id}
                  data-state={selected ? "selected" : undefined}
                  className={cn(selection.selectionMode && "cursor-pointer")}
                  onClickCapture={selectionClickCapture(selection.selectionMode, toggle)}
                >
                  <TableCell>
                    <SelectCheckbox
                      label={`Select ${noteTitleText(row.original.name)}`}
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
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {total === 0
              ? "No notes"
              : `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <Select
            items={PAGE_SIZE_OPTIONS.map((size) => ({
              value: String(size),
              label: `${size} / page`,
            }))}
            value={String(pageSize)}
            onValueChange={(value) => value && onPageSizeChange(Number(value))}
          >
            <SelectTrigger size="sm" className="h-7 w-18">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <CaretLeftIcon />
          </Button>
          <span className="px-1 tabular-nums">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <CaretRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}
