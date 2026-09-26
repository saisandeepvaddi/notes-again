import { toast } from "@/components/ui/toast";
import { useBulkNotes, type BulkAction, type BulkResult } from "../hooks/useBulkNotes";

export const notesLabel = (count: number) =>
  `${count.toLocaleString()} note${count === 1 ? "" : "s"}`;

// Runs one bulk action on the selection, then clears it (a stale selection
// after e.g. moving notes out of the filtered project would leave notes
// selected that are no longer visible) and reports what happened.
export function useRunBulk(ids: () => number[], onDone: () => void) {
  const { mutateAsync, isPending } = useBulkNotes();

  const run = async (
    request: BulkAction,
    success: (affected: number, result: BulkResult) => string,
  ) => {
    try {
      const result = await mutateAsync({ noteIds: ids(), ...request });
      onDone();
      toast.add({ type: "success", description: success(result.affected, result) });
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  };

  return { run, isPending };
}
