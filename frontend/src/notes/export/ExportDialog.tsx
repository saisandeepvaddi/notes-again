import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState, type ReactElement } from "react";
import { useProjects } from "../hooks/useProjects";
import { useTags } from "../hooks/useTags";
import { downloadExport, fetchExportCount, type ExportOptions } from "./exportApi";

const NO_PROJECT = -1;
const SEARCH_THRESHOLD = 8;

type Scope = "all" | "filtered";

interface ChecklistItem {
  id: number;
  name: string;
}

function Checklist({
  label,
  items,
  selected,
  onToggle,
  onClear,
  emptyText,
}: {
  label: string;
  items: ChecklistItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onClear: () => void;
  emptyText: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between">
        <span className="font-medium">
          {label}
          {selected.size > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">· {selected.size}</span>
          )}
        </span>
        {selected.size > 0 && (
          <Button type="button" size="xs" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      <Command className="rounded-md ring-1 ring-foreground/10 [&:not(:focus-within)_[data-slot=command-item]]:bg-transparent">
        {items.length > SEARCH_THRESHOLD && (
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} />
        )}
        <CommandList className="max-h-44">
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.name}-${item.id}`}
                data-checked={selected.has(item.id)}
                onSelect={() => onToggle(item.id)}
                className={cn(item.id === NO_PROJECT && "text-muted-foreground")}
              >
                <span className="truncate">{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function toggled(set: Set<number>, id: number) {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

function matchRule(projects: number, tags: number) {
  if (projects && tags) return "Notes in the chosen projects that have any of the chosen tags.";
  if (projects) return "Every note in the chosen projects.";
  if (tags) return "Every note with any of the chosen tags.";
  return "Choose at least one project or tag.";
}

function notesLabel(count: number) {
  return `${count.toLocaleString()} note${count === 1 ? "" : "s"}`;
}

interface ExportDialogProps {
  trigger: ReactElement;
  noteIds?: () => number[];
  selectedCount?: number;
  defaultProjectId?: number;
  defaultTagId?: number;
}

export function ExportDialog({
  trigger,
  noteIds,
  selectedCount,
  defaultProjectId,
  defaultTagId,
}: ExportDialogProps) {
  const isSelection = noteIds !== undefined;
  const { data: projects = [] } = useProjects();
  const { data: allTags = [] } = useTags();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [projectIds, setProjectIds] = useState<Set<number>>(new Set());
  const [tagIds, setTagIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<number[] | null>(null);
  const [includePaused, setIncludePaused] = useState(true);
  const [includeReview, setIncludeReview] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    if (noteIds) {
      setSelectedIds(noteIds());
      return;
    }
    const hasFilter = defaultProjectId !== undefined || defaultTagId !== undefined;
    setScope(hasFilter ? "filtered" : "all");
    setProjectIds(new Set(defaultProjectId !== undefined ? [defaultProjectId] : []));
    setTagIds(new Set(defaultTagId !== undefined ? [defaultTagId] : []));
  };

  const filtered = !isSelection && scope === "filtered";
  const realProjectIds = [...projectIds].filter((id) => id !== NO_PROJECT);
  const options: ExportOptions = {
    project_ids: filtered ? realProjectIds : [],
    include_no_project: filtered && projectIds.has(NO_PROJECT),
    tag_ids: filtered ? [...tagIds] : [],
    note_ids: isSelection ? (selectedIds ?? []) : null,
    include_paused: includePaused,
    include_review: includeReview,
  };
  const missingFilter = filtered && projectIds.size === 0 && tagIds.size === 0;

  const { data: count, isFetching } = useQuery({
    queryKey: ["notes", "export-count", options],
    queryFn: () => fetchExportCount(options),
    enabled: open && !missingFilter,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const noteCount = missingFilter ? 0 : (count?.notes ?? 0);

  const runExport = async () => {
    setIsExporting(true);
    try {
      await downloadExport(options);
      toast.add({ type: "success", description: `Exported ${notesLabel(noteCount)}` });
      setOpen(false);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Couldn't export your notes" });
    } finally {
      setIsExporting(false);
    }
  };

  const projectItems: ChecklistItem[] = [
    { id: NO_PROJECT, name: "No project" },
    ...projects.map((project) => ({ id: project.id, name: project.name })),
  ];
  const tagItems: ChecklistItem[] = [...allTags]
    .sort((a, b) => Number(b.is_difficulty) - Number(a.is_difficulty))
    .map((tag) => ({ id: tag.id, name: tag.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export notes</DialogTitle>
          <DialogDescription>
            A JSON file you can bring back with Import, here or on another instance.
          </DialogDescription>
        </DialogHeader>

        {isSelection ? (
          <p className="rounded-md bg-muted px-3 py-2">
            The {notesLabel(selectedCount ?? selectedIds?.length ?? 0)} you selected.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              className="flex w-fit items-center gap-0.5 rounded-md border p-0.5"
              role="group"
              aria-label="Which notes"
            >
              {(
                [
                  ["all", "All notes"],
                  ["filtered", "By project or tag"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-pressed={scope === value}
                  className={cn(scope === value && "bg-muted text-foreground")}
                  onClick={() => setScope(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {filtered && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Checklist
                    label="Projects"
                    items={projectItems}
                    selected={projectIds}
                    onToggle={(id) => setProjectIds((set) => toggled(set, id))}
                    onClear={() => setProjectIds(new Set())}
                    emptyText="No matching projects"
                  />
                  <Checklist
                    label="Tags"
                    items={tagItems}
                    selected={tagIds}
                    onToggle={(id) => setTagIds((set) => toggled(set, id))}
                    onClear={() => setTagIds(new Set())}
                    emptyText="No matching tags"
                  />
                </div>
                <p className={cn("text-muted-foreground", missingFilter && "text-foreground")}>
                  {matchRule(projectIds.size, tagIds.size)}
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              className="mt-0.5"
              checked={includeReview}
              onCheckedChange={(checked) => setIncludeReview(checked === true)}
            />
            <span className="flex flex-col">
              <span className="font-medium">Include review progress</span>
              <span className="text-muted-foreground">
                Schedule, rating history and paused state. Turn off to share notes that start fresh
                when imported.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              className="mt-0.5"
              checked={includePaused}
              onCheckedChange={(checked) => setIncludePaused(checked === true)}
            />
            <span className="font-medium">Include paused notes</span>
          </label>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground" aria-live="polite">
            {isFetching && <Spinner className="size-3" />}
            {missingFilter
              ? "Nothing chosen yet"
              : count
                ? `${notesLabel(count.notes)}${count.decks ? ` in ${count.decks.toLocaleString()} project${count.decks === 1 ? "" : "s"}` : ""}`
                : "Counting…"}
          </span>
          <Button onClick={runExport} disabled={isExporting || noteCount === 0}>
            {isExporting ? <Spinner /> : <DownloadSimpleIcon />} Export {notesLabel(noteCount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
