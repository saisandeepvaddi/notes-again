import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CalendarClockIcon,
  FolderIcon,
  GaugeIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { DIFFICULTY_OPTIONS } from "../difficulty";
import { useCreateProject } from "../hooks/useCreateProject";
import { useCreateTag } from "../hooks/useCreateTag";
import { useProjects } from "../hooks/useProjects";
import { useTags } from "../hooks/useTags";
import { notesLabel, useRunBulk } from "./useRunBulk";

interface NotesSelectionActionsProps {
  ids: () => number[];
  count: number;
  onDone: () => void;
}

// Used as a PopoverTrigger `render` element, so it must pass the trigger's
// props (click handler, ref, aria-*) through to the Button.
function ActionButton({
  icon,
  children,
  ...props
}: { icon: ReactNode } & Omit<ComponentProps<typeof Button>, "size" | "variant">) {
  return (
    <Button type="button" size="sm" variant="outline" {...props}>
      {icon}
      {children}
    </Button>
  );
}

// Every popover opens upward: the bar sits at the bottom of the screen.
function ActionPopover({
  trigger,
  className,
  open,
  onOpenChange,
  children,
}: {
  trigger: ReactElement;
  className?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side="top" className={className}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function NotesSelectionActions({ ids, count, onDone }: NotesSelectionActionsProps) {
  const { run, isPending } = useRunBulk(ids, onDone);
  const { data: projects = [] } = useProjects();
  const { data: allTags = [] } = useTags();
  const { mutateAsync: createProject } = useCreateProject();
  const { mutateAsync: createTag } = useCreateTag();
  // difficulty tags are changed with the Difficulty action, never as plain tags
  const tags = allTags.filter((tag) => !tag.is_difficulty);

  const [open, setOpen] = useState<"project" | "tags" | "difficulty" | "reschedule" | null>(null);
  const [tagMode, setTagMode] = useState<"add" | "remove">("add");
  const [query, setQuery] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const label = notesLabel(count);

  const openPopover = (which: NonNullable<typeof open>) => (next: boolean) => {
    setOpen(next ? which : null);
    setQuery("");
  };
  const close = () => setOpen(null);

  const trimmedQuery = query.trim();
  const projectExists = projects.some((p) => p.name.toLowerCase() === trimmedQuery.toLowerCase());
  const tagExists = tags.some((t) => t.name.toLowerCase() === trimmedQuery.toLowerCase());

  const moveToProject = async (project: { id: number; name: string } | null) => {
    close();
    await run(
      { action: "project", project_id: project?.id ?? null },
      (n) =>
        project
          ? `Moved ${notesLabel(n)} to ${project.name}`
          : `Removed ${notesLabel(n)} from their project`,
    );
  };

  const createProjectAndMove = async () => {
    try {
      await moveToProject(await createProject(trimmedQuery));
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to create project",
      });
    }
  };

  const editTag = async (tag: { id: number; name: string }) => {
    close();
    await run(
      tagMode === "add" ? { action: "tags", add_tag_ids: [tag.id] } : { action: "tags", remove_tag_ids: [tag.id] },
      (n) =>
        tagMode === "add"
          ? `Added “${tag.name}” to ${notesLabel(n)}`
          : `Removed “${tag.name}” from ${notesLabel(n)}`,
    );
  };

  const createTagAndAdd = async () => {
    try {
      const tag = await createTag(trimmedQuery);
      close();
      await run({ action: "tags", add_tag_ids: [tag.id] }, (n) => `Added “${tag.name}” to ${notesLabel(n)}`);
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to create tag",
      });
    }
  };

  const reschedule = async (date: Date | undefined) => {
    if (!date) return;
    close();
    await run(
      { action: "reschedule", remind_at: date.toISOString() },
      (n) => `Rescheduled ${notesLabel(n)} to ${format(date, "MMM d")}`,
    );
  };

  return (
    <>
      <ActionPopover
        open={open === "project"}
        onOpenChange={openPopover("project")}
        className="w-56 p-0"
        trigger={<ActionButton icon={<FolderIcon />}>Project</ActionButton>}
      >
        <Command>
          <CommandInput placeholder="Move to project..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No projects yet</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => moveToProject(null)}>
                No project
              </CommandItem>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  onSelect={() => moveToProject(project)}
                >
                  {project.name}
                </CommandItem>
              ))}
              {trimmedQuery && !projectExists && (
                <CommandItem value={`create-${trimmedQuery}`} onSelect={createProjectAndMove}>
                  Create "{trimmedQuery}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </ActionPopover>

      <ActionPopover
        open={open === "tags"}
        onOpenChange={openPopover("tags")}
        className="w-60 gap-0 p-0"
        trigger={<ActionButton icon={<TagIcon />}>Tags</ActionButton>}
      >
        <div className="flex gap-1 border-b p-1.5">
          {(["add", "remove"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="xs"
              variant={tagMode === mode ? "secondary" : "ghost"}
              className="flex-1 capitalize"
              onClick={() => setTagMode(mode)}
            >
              {mode} tag
            </Button>
          ))}
        </div>
        <Command>
          <CommandInput
            placeholder={tagMode === "add" ? "Search or create tag..." : "Search tags..."}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No tags yet</CommandEmpty>
            <CommandGroup>
              {tags.map((tag) => (
                <CommandItem key={tag.id} value={tag.name} onSelect={() => editTag(tag)}>
                  {tag.name}
                </CommandItem>
              ))}
              {tagMode === "add" && trimmedQuery && !tagExists && (
                <CommandItem value={`create-${trimmedQuery}`} onSelect={createTagAndAdd}>
                  Create "{trimmedQuery}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </ActionPopover>

      <ActionPopover
        open={open === "difficulty"}
        onOpenChange={openPopover("difficulty")}
        className="w-28 p-1"
        trigger={<ActionButton icon={<GaugeIcon />}>Difficulty</ActionButton>}
      >
        <div className="flex flex-col gap-0.5">
          {DIFFICULTY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isPending}
              className={cn("rounded-md px-2 py-1 text-left text-xs/relaxed hover:bg-muted")}
              onClick={() => {
                close();
                void run(
                  { action: "difficulty", difficulty: option.value },
                  (n) => `Set ${notesLabel(n)} to ${option.label}`,
                );
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </ActionPopover>

      <ActionPopover
        open={open === "reschedule"}
        onOpenChange={openPopover("reschedule")}
        className="w-auto p-2"
        trigger={<ActionButton icon={<CalendarClockIcon />}>Reschedule</ActionButton>}
      >
        <Button
          size="sm"
          variant="secondary"
          className="mb-2 w-full"
          disabled={isPending}
          onClick={() => reschedule(new Date())}
        >
          Review today
        </Button>
        <Calendar mode="single" onSelect={reschedule} />
      </ActionPopover>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogTrigger
          render={
            <Button type="button" size="sm" variant="destructive">
              <Trash2Icon /> Delete
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Move {label} to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave your review queue, but you can restore them from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={async () => {
                await run({ action: "delete" }, (n) => `Moved ${notesLabel(n)} to Trash`);
                setConfirmingDelete(false);
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
