import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { CheckIcon, FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "../difficulty";
import { useTags } from "../hooks/useTags";
import type { Difficulty, Tag } from "../new-note-form/types";
import { REVIEW_STATUS_LABELS, REVIEW_STATUSES, type ReviewStatus } from "../reviewStatus";

interface NotesFiltersProps {
  status?: ReviewStatus;
  tagId?: number;
  onStatusChange: (status: ReviewStatus | undefined) => void;
  onTagChange: (tagId: number | undefined) => void;
  onClear: () => void;
}

const difficultyRank = (tag: Tag) =>
  DIFFICULTY_OPTIONS.findIndex((option) => option.value === tag.name.toLowerCase());

const STATUS_OPTIONS: { value: ReviewStatus | undefined; label: string }[] = [
  { value: undefined, label: "Any status" },
  ...REVIEW_STATUSES.map((status) => ({ value: status, label: REVIEW_STATUS_LABELS[status] })),
];

export function NotesFilters({
  status,
  tagId,
  onStatusChange,
  onTagChange,
  onClear,
}: NotesFiltersProps) {
  const { data: allTags = [] } = useTags();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const difficultyTags = allTags
    .filter((tag) => tag.is_difficulty)
    .sort((a, b) => difficultyRank(a) - difficultyRank(b));
  const regularTags = [...allTags]
    .filter((tag) => !tag.is_difficulty)
    .sort((a, b) => b.note_count - a.note_count);
  const filteredTags = query
    ? regularTags.filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase()))
    : regularTags;

  const activeCount = (status ? 1 : 0) + (tagId != null ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            aria-label="Filters"
            className={cn("gap-1.5", activeCount > 0 && "border-primary/40 text-foreground")}
          >
            <FunnelIcon />
            Filters
            {activeCount > 0 && (
              <Badge variant="default" className="px-1.5 tabular-nums">
                {activeCount}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 gap-3 p-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Review status
          </p>
          {STATUS_OPTIONS.map((option) => (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={status === option.value}
              onClick={() => onStatusChange(option.value)}
              className={cn(
                "justify-between",
                status === option.value && "bg-muted text-foreground",
              )}
            >
              {option.label}
              {status === option.value && <CheckIcon className="size-3" />}
            </Button>
          ))}
        </div>

        {allTags.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Tags
              </p>
              {difficultyTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-0.5 pb-1">
                  {difficultyTags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant="outline"
                      className={cn(
                        "cursor-pointer capitalize",
                        tagId === tag.id
                          ? DIFFICULTY_BADGE_CLASSES[tag.name.toLowerCase() as Difficulty]
                          : "opacity-60 hover:opacity-100",
                      )}
                      onClick={() => onTagChange(tagId === tag.id ? undefined : tag.id)}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              )}
              {regularTags.length > 8 && (
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Find a tag..."
                    aria-label="Find a tag"
                    className="h-7 pl-7"
                  />
                </div>
              )}
              <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {filteredTags.length === 0 ? (
                  <p className="px-2 py-1.5 text-muted-foreground">No tags match.</p>
                ) : (
                  filteredTags.map((tag) => (
                    <Button
                      key={tag.id}
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-pressed={tagId === tag.id}
                      onClick={() => onTagChange(tagId === tag.id ? undefined : tag.id)}
                      className={cn(
                        "justify-between",
                        tagId === tag.id && "bg-muted text-foreground",
                      )}
                    >
                      <span className="min-w-0 truncate">{tag.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                        {tag.note_count}
                        {tagId === tag.id && <CheckIcon className="size-3" />}
                      </span>
                    </Button>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {activeCount > 0 && (
          <>
            <Separator />
            <Button
              size="sm"
              variant="ghost"
              className="justify-start text-muted-foreground"
              onClick={onClear}
            >
              Clear filters
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
