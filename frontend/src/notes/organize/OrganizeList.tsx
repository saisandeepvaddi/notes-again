import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { FolderIcon, LockIcon, TagIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useProjects } from "../hooks/useProjects";
import { useTags } from "../hooks/useTags";
import { DeleteGroupDialog } from "./DeleteGroupDialog";
import { DeleteUnusedTagsButton } from "./DeleteUnusedTagsButton";
import type { GroupKind } from "../hooks/useDeleteGroup";

interface RowProps {
  kind: GroupKind;
  id: number;
  name: string;
  noteCount: number;
  // Built-in tags can't be deleted.
  locked?: boolean;
}

function Row({ kind, id, name, noteCount, locked }: RowProps) {
  const Icon = kind === "project" ? FolderIcon : TagIcon;
  const search = kind === "project" ? { projectId: id } : { tagId: id };
  return (
    <li className="flex h-11 items-center gap-3 px-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <Link
        to="/notes"
        search={search}
        className="shrink-0 text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline"
      >
        {noteCount.toLocaleString()} note{noteCount === 1 ? "" : "s"}
      </Link>
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
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Projects"
        description="Deleting a project keeps its notes (they go to no project) unless you choose to delete them too."
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
              tags?.filter((tag) => !tag.is_difficulty && tag.note_count === 0).map((tag) => tag.name) ?? []
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
            locked={tag.is_difficulty}
          />
        ))}
      </Section>
    </div>
  );
}
