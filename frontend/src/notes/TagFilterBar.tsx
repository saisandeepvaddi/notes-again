import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { DIFFICULTY_BADGE_CLASSES } from "./difficulty";
import { useTags } from "./hooks/useTags";
import type { Difficulty } from "./new-note-form/types";

interface TagFilterBarProps {
  activeTagId?: number;
}

export function TagFilterBar({ activeTagId }: TagFilterBarProps) {
  const { data: allTags = [] } = useTags();
  const navigate = useNavigate();

  if (allTags.length === 0) {
    return null;
  }

  const difficultyTags = allTags.filter((tag) => tag.is_difficulty);
  // Projects have their own home (the sidebar) and filter param, so keep
  // them out of the plain tag list here.
  const regularTags = allTags.filter((tag) => !tag.is_difficulty && !tag.is_project);

  const goToTag = (tagId?: number) => navigate({ to: "/notes", search: tagId ? { tagId } : {} });

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
      {regularTags.map((tag) => (
        <Badge
          key={tag.id}
          variant={activeTagId === tag.id ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => goToTag(tag.id)}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
