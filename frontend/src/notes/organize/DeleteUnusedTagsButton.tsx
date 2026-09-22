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
import { toast } from "@/components/ui/toast";
import { BrushCleaningIcon } from "lucide-react";
import { useState } from "react";
import { useDeleteUnusedTags } from "../hooks/useDeleteUnusedTags";

const MAX_LISTED = 12;

interface DeleteUnusedTagsButtonProps {
  // Names of the tags no live note carries.
  unusedTagNames: string[];
}

export function DeleteUnusedTagsButton({ unusedTagNames }: DeleteUnusedTagsButtonProps) {
  const [open, setOpen] = useState(false);
  const { mutateAsync, isPending } = useDeleteUnusedTags();
  const count = unusedTagNames.length;
  if (count === 0) return null;

  const listed = unusedTagNames.slice(0, MAX_LISTED).join(", ");
  const more = count > MAX_LISTED ? ` and ${(count - MAX_LISTED).toLocaleString()} more` : "";

  const confirm = async () => {
    try {
      const { tags_deleted } = await mutateAsync();
      setOpen(false);
      toast.add({
        type: "success",
        description: `Deleted ${tags_deleted.toLocaleString()} unused tag${tags_deleted === 1 ? "" : "s"}`,
      });
    } catch (error) {
      setOpen(false);
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Failed to delete unused tags",
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button type="button" size="sm" variant="outline">
            <BrushCleaningIcon /> Delete {count.toLocaleString()} unused
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <BrushCleaningIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Delete {count.toLocaleString()} unused tag{count === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {listed}
            {more}. None of them is on any note. Notes in Trash that had one will come back
            without it if restored.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={isPending}>
            Delete unused tags
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
