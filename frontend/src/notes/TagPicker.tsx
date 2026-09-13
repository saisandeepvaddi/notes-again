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
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useCreateTag } from "./hooks/useCreateTag";
import { useTags } from "./hooks/useTags";
import type { Tag } from "./new-note-form/types";

interface TagPickerProps {
  selectedTags: Tag[];
  onToggle: (tag: Tag) => void;
  onTagClick?: (tag: Tag) => void;
  triggerLabel?: string;
}

export function TagPicker({
  selectedTags,
  onToggle,
  onTagClick,
  triggerLabel = "Tag",
}: TagPickerProps) {
  const { data: allTags = [] } = useTags();
  // difficulty tags (Easy/Medium/Hard) are sticky and managed via DifficultySelector, not here
  const tags = allTags.filter((tag) => !tag.is_difficulty);
  const { mutateAsync: createTag, isPending: isCreating } = useCreateTag();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedIds = new Set(selectedTags.map((tag) => tag.id));
  const trimmedQuery = query.trim();
  const hasExactMatch = tags.some((tag) => tag.name.toLowerCase() === trimmedQuery.toLowerCase());

  const createAndSelect = async () => {
    if (!trimmedQuery) return;
    try {
      const tag = await createTag(trimmedQuery);
      onToggle(tag);
      setQuery("");
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to create tag",
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedTags.map((tag) => (
        <Badge key={tag.id} variant="secondary" className="gap-1">
          {onTagClick ? (
            <button type="button" onClick={() => onTagClick(tag)} className="hover:underline">
              {tag.name}
            </button>
          ) : (
            tag.name
          )}
          <button
            type="button"
            onClick={() => onToggle(tag)}
            className="opacity-60 hover:opacity-100"
          >
            <XIcon className="size-2.5" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button size="sm" variant="outline">
              <PlusIcon /> {triggerLabel}
            </Button>
          }
        />
        <PopoverContent className="w-56 p-0">
          <Command>
            <CommandInput
              placeholder="Search or create tag..."
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
                  "No tags yet"
                )}
              </CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.name}
                    onSelect={() => onToggle(tag)}
                    data-checked={selectedIds.has(tag.id)}
                  >
                    {tag.name}
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
