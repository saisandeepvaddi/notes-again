import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";
import { useTags } from "./hooks/useTags";

interface TagFilterBarProps {
  activeTagId?: number;
}

export function TagFilterBar({ activeTagId }: TagFilterBarProps) {
  const { data: tags = [] } = useTags();
  const navigate = useNavigate();

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        variant={activeTagId == null ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => navigate({ to: "/notes", search: {} })}
      >
        All
      </Badge>
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant={activeTagId === tag.id ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => navigate({ to: "/notes", search: { tagId: tag.id } })}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
