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
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "./difficulty";
import { useTags } from "./hooks/useTags";
import type { Difficulty, Tag } from "./new-note-form/types";

interface TagFilterBarProps {
  activeTagId?: number;
}

const MAX_VISIBLE_TAGS = 8;

const difficultyRank = (tag: Tag) =>
  DIFFICULTY_OPTIONS.findIndex((option) => option.value === tag.name.toLowerCase());

export function TagFilterBar({ activeTagId }: TagFilterBarProps) {
  const { data: allTags = [] } = useTags();
  const navigate = useNavigate();
  const [overflowOpen, setOverflowOpen] = useState(false);

  if (allTags.length === 0) {
    return null;
  }

  const difficultyTags = allTags
    .filter((tag) => tag.is_difficulty)
    .sort((a, b) => difficultyRank(a) - difficultyRank(b));
  const regularTags = [...allTags]
    .filter((tag) => !tag.is_difficulty)
    .sort((a, b) => b.note_count - a.note_count);

  const activeTag = regularTags.find((tag) => tag.id === activeTagId);
  const visible = regularTags.slice(0, MAX_VISIBLE_TAGS);
  if (activeTag && !visible.some((tag) => tag.id === activeTag.id)) {
    visible[visible.length - 1] = activeTag;
  }
  const visibleIds = new Set(visible.map((tag) => tag.id));
  const overflowTags = regularTags.filter((tag) => !visibleIds.has(tag.id));

  const goToTag = (tagId?: number) =>
    navigate({ to: "/notes", search: (prev) => ({ ...prev, tagId }) });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={activeTagId == null ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => goToTag()}
      >
        All
      </Badge>
      {difficultyTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className={cn(
            "cursor-pointer capitalize",
            activeTagId === tag.id
              ? DIFFICULTY_BADGE_CLASSES[tag.name.toLowerCase() as Difficulty]
              : "opacity-60 hover:opacity-100",
          )}
          onClick={() => goToTag(tag.id)}
        >
          {tag.name}
        </Badge>
      ))}
      {difficultyTags.length > 0 && visible.length > 0 && (
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      )}
      {visible.map((tag) => (
        <Badge
          key={tag.id}
          variant={activeTagId === tag.id ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => goToTag(tag.id)}
        >
          {tag.name}
        </Badge>
      ))}
      {overflowTags.length > 0 && (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger
            render={
              <Button type="button" size="xs" variant="outline">
                +{overflowTags.length}
              </Button>
            }
          />
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Find a tag..." />
              <CommandList>
                <CommandEmpty>No matches</CommandEmpty>
                <CommandGroup>
                  {overflowTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      data-checked={activeTagId === tag.id}
                      onSelect={() => {
                        goToTag(tag.id);
                        setOverflowOpen(false);
                      }}
                    >
                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
