import { OrganizeSkeleton } from "@/components/PageSkeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { Link } from "@tanstack/react-router";
import {
  FileTextIcon,
  FolderIcon,
  LockIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  addedToReviewSummary,
  resumeSummary,
  useAddGroupToReview,
  usePauseGroup,
  useRemoveGroupFromReview,
  useResumeGroup,
} from "../hooks/usePausing";
import { useProjects } from "../hooks/useProjects";
import { ResumePacingForm } from "../ResumePacingForm";
import { useTags } from "../hooks/useTags";
import { DeleteGroupDialog } from "./DeleteGroupDialog";
import { DeleteUnusedTagsButton } from "./DeleteUnusedTagsButton";
import type { GroupKind } from "../hooks/useDeleteGroup";

interface RowProps {
  kind: GroupKind;
  id: number;
  name: string;
  noteCount: number;
  pausedCount: number;
  noteOnlyCount: number;
  paused?: boolean;
  locked?: boolean;
}

function reportError(error: unknown) {
  toast.add({
    type: "error",
    priority: "high",
    description: error instanceof Error ? error.message : "Something went wrong",
  });
}

function PauseControls({
  kind,
  id,
  name,
  noteCount,
  pausedCount,
  noteOnlyCount,
  paused = false,
}: Omit<RowProps, "locked">) {
  const pause = usePauseGroup(kind);
  const resume = useResumeGroup(kind);
  const [resumeOpen, setResumeOpen] = useState(false);
  const canPause = pausedCount + noteOnlyCount < noteCount || (kind === "project" && !paused);
  const canResume = pausedCount > 0 || paused;

  const onPause = async () => {
    try {
      const { affected } = await pause.mutateAsync(id);
      toast.add({
        type: "success",
        description:
          kind === "project"
            ? `Paused “${name}” (${affected.toLocaleString()} notes). New notes in it start paused.`
            : `Paused ${affected.toLocaleString()} notes tagged “${name}”.`,
      });
    } catch (error) {
      reportError(error);
    }
  };

  const onResume = async (perDay: number) => {
    try {
      const result = await resume.mutateAsync({ id, perDay });
      setResumeOpen(false);
      toast.add({ type: "success", description: resumeSummary(result) });
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <>
      {canPause && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Pause ${kind} ${name}`}
          title={
            kind === "project"
              ? "Pause: keep its notes out of review, and new ones too"
              : "Pause: keep its notes out of review"
          }
          disabled={pause.isPending}
          onClick={onPause}
          className="shrink-0 text-muted-foreground"
        >
          <PauseIcon />
          <span className="hidden sm:inline">Pause</span>
        </Button>
      )}
      {canResume && (
        <Popover open={resumeOpen} onOpenChange={setResumeOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Resume ${kind} ${name}`}
                title="Resume: bring its paused notes back into review"
                className="shrink-0 text-muted-foreground"
              >
                <PlayIcon />
                <span className="hidden sm:inline">Resume</span>
              </Button>
            }
          />
          <PopoverContent align="end" className="w-64 p-3">
            <p className="text-sm font-medium">
              Resume {pausedCount.toLocaleString()} paused note{pausedCount === 1 ? "" : "s"}
            </p>
            <ResumePacingForm isPending={resume.isPending} onResume={onResume} />
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

function NoteOnlyControls({
  kind,
  id,
  name,
  noteCount,
  noteOnlyCount,
}: Pick<RowProps, "kind" | "id" | "name" | "noteCount" | "noteOnlyCount">) {
  const remove = useRemoveGroupFromReview(kind);
  const add = useAddGroupToReview(kind);
  const [open, setOpen] = useState(false);
  const inReview = noteCount - noteOnlyCount;
  const notes = (count: number) => `${count.toLocaleString()} note${count === 1 ? "" : "s"}`;

  const onRemove = async () => {
    try {
      const { affected } = await remove.mutateAsync(id);
      setOpen(false);
      toast.add({
        type: "success",
        description:
          kind === "project"
            ? `Made ${notes(affected)} in “${name}” note only.`
            : `Made ${notes(affected)} tagged “${name}” note only.`,
      });
    } catch (error) {
      reportError(error);
    }
  };

  const onAdd = async (perDay: number) => {
    try {
      const result = await add.mutateAsync({ id, perDay });
      setOpen(false);
      toast.add({ type: "success", description: addedToReviewSummary(result) });
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Note only options for ${kind} ${name}`}
            title="Note only: take its notes out of review, or add note-only ones back"
            className="shrink-0 text-muted-foreground"
          >
            <FileTextIcon />
            <span className="hidden sm:inline">Note only</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-3">
        {inReview > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={remove.isPending}
              onClick={onRemove}
            >
              <FileTextIcon /> Make {notes(inReview)} note only
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes them out of review, paused ones included. Past reviews are kept.
            </p>
          </div>
        )}
        {noteOnlyCount > 0 && (
          <div className={inReview > 0 ? "border-t pt-3" : undefined}>
            <p className="mb-2 text-sm font-medium">Add {notes(noteOnlyCount)} to review</p>
            <ResumePacingForm
              isPending={add.isPending}
              onResume={onAdd}
              submitLabel="Add to review"
              icon={<RepeatIcon />}
              description="They become due this many a day; 0 makes them all due now."
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Row({ kind, id, name, noteCount, pausedCount, noteOnlyCount, paused, locked }: RowProps) {
  const Icon = kind === "project" ? FolderIcon : TagIcon;
  const search = kind === "project" ? { projectId: id } : { tagId: id };
  return (
    <li className="flex h-11 items-center gap-3 px-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {paused && (
        <Badge
          variant="outline"
          className="shrink-0 gap-1 text-muted-foreground"
          title="New notes in this project start paused"
        >
          <PauseIcon className="size-3" /> Paused
        </Badge>
      )}
      {pausedCount > 0 && (
        <Link
          to="/notes"
          search={{ ...search, status: "paused" }}
          className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
        >
          {pausedCount.toLocaleString()} paused
        </Link>
      )}
      {noteOnlyCount > 0 && (
        <Link
          to="/notes"
          search={{ ...search, status: "note-only" }}
          className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
        >
          {noteOnlyCount.toLocaleString()} note only
        </Link>
      )}
      <Link
        to="/notes"
        search={search}
        className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
      >
        {noteCount.toLocaleString()} note{noteCount === 1 ? "" : "s"}
      </Link>
      {noteCount > 0 || paused ? (
        <PauseControls
          kind={kind}
          id={id}
          name={name}
          noteCount={noteCount}
          pausedCount={pausedCount}
          noteOnlyCount={noteOnlyCount}
          paused={paused}
        />
      ) : null}
      {noteCount > 0 && (
        <NoteOnlyControls
          kind={kind}
          id={id}
          name={name}
          noteCount={noteCount}
          noteOnlyCount={noteOnlyCount}
        />
      )}
      {locked ? (
        <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
          <LockIcon className="size-3" /> Built-in
        </Badge>
      ) : (
        <DeleteGroupDialog
          kind={kind}
          id={id}
          name={name}
          noteCount={noteCount}
          trigger={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${kind} ${name}`}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2Icon />
            </Button>
          }
        />
      )}
    </li>
  );
}

function Section({
  title,
  description,
  empty,
  isEmpty,
  actions,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  isEmpty: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

export function OrganizeList() {
  const { data: projects, isPending: projectsPending } = useProjects();
  const { data: tags, isPending: tagsPending } = useTags();

  if (projectsPending || tagsPending) {
    return <OrganizeSkeleton />;
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Projects"
        description="Pausing a project keeps its notes out of review, and new notes in it start paused. Deleting one keeps its notes (they go to no project) unless you choose to delete them too."
        empty="No projects yet."
        isEmpty={!projects?.length}
      >
        {projects?.map((project) => (
          <Row
            key={project.id}
            kind="project"
            id={project.id}
            name={project.name}
            noteCount={project.note_count}
            pausedCount={project.paused_count}
            noteOnlyCount={project.note_only_count}
            paused={project.paused}
          />
        ))}
      </Section>
      <Section
        title="Tags"
        description="Deleting a tag removes it from its notes, which are kept unless you choose to delete them too."
        empty="No tags yet."
        isEmpty={!tags?.length}
        actions={
          <DeleteUnusedTagsButton
            unusedTagNames={
              tags
                ?.filter((tag) => !tag.is_difficulty && tag.note_count === 0)
                .map((tag) => tag.name) ?? []
            }
          />
        }
      >
        {tags?.map((tag) => (
          <Row
            key={tag.id}
            kind="tag"
            id={tag.id}
            name={tag.name}
            noteCount={tag.note_count}
            pausedCount={tag.paused_count}
            noteOnlyCount={tag.note_only_count}
            locked={tag.is_difficulty}
          />
        ))}
      </Section>
    </div>
  );
}
