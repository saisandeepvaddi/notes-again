import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { RepeatIcon } from "@phosphor-icons/react";
import { useDueCount } from "./notes-list/useDueNotes";

export function ReviewDueButton() {
  const { data: due = 0 } = useDueCount();
  if (due === 0) {
    return null;
  }
  return (
    <Button
      variant="secondary"
      nativeButton={false}
      render={
        <Link to="/review">
          <RepeatIcon /> Review
          <Badge className="tabular-nums">{due.toLocaleString()} due</Badge>
        </Link>
      }
    />
  );
}
