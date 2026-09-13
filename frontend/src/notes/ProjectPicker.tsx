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
import { toast } from "@/components/ui/toast";
import { FolderIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useCreateProject } from "./hooks/useCreateProject";
import { useProjects } from "./hooks/useProjects";
import type { Tag } from "./new-note-form/types";

interface ProjectPickerProps {
  value: Tag | null;
  onChange: (project: Tag | null) => void;
  onProjectClick?: (project: Tag) => void;
}

// Single-select, unlike TagPicker -- a note has at most one project, swapped
// rather than added alongside (mirrors how Easy/Medium/Hard difficulty works).
export function ProjectPicker({ value, onChange, onProjectClick }: ProjectPickerProps) {
  const { data: projects = [] } = useProjects();
  const { mutateAsync: createProject, isPending: isCreating } = useCreateProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();
  const hasExactMatch = projects.some(
    (project) => project.name.toLowerCase() === trimmedQuery.toLowerCase(),
  );

  const select = (project: Tag | null) => {
    onChange(project);
    setOpen(false);
    setQuery("");
  };

  const createAndSelect = async () => {
    if (!trimmedQuery) {
      return;
    }
    try {
      const project = await createProject(trimmedQuery);
      select(project);
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to create project",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      {value && (
        <Badge variant="secondary" className="gap-1">
          <FolderIcon className="size-3" />
          {onProjectClick ? (
            <button type="button" onClick={() => onProjectClick(value)} className="hover:underline">
              {value.name}
            </button>
          ) : (
            value.name
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="opacity-60 hover:opacity-100"
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button type="button" size="sm" variant="outline">
              <PlusIcon /> {value ? "Change project" : "Project"}
            </Button>
          }
        />
        <PopoverContent className="w-56 p-0">
          <Command>
            <CommandInput
              placeholder="Search or create project..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {trimmedQuery ? (
                  <button
                    type="button"
                    disabled={isCreating}
                    onClick={createAndSelect}
                    className="text-xs text-primary hover:underline"
                  >
                    Create "{trimmedQuery}"
                  </button>
                ) : (
                  "No projects yet"
                )}
              </CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem value="__none__" onSelect={() => select(null)}>
                    No project
                  </CommandItem>
                )}
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.name}
                    onSelect={() => select(project)}
                    data-checked={value?.id === project.id}
                  >
                    {project.name}
                  </CommandItem>
                ))}
                {trimmedQuery && !hasExactMatch && (
                  <CommandItem
                    value={`create-${trimmedQuery}`}
                    onSelect={createAndSelect}
                    disabled={isCreating}
                  >
                    Create "{trimmedQuery}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
