import { useEffect, useState } from "react";
import { useSearch } from "@/command-palette/searchApi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  excludeUid?: string;
  onOpenChange(open: boolean): void;
  onPick(note: { title: string; uid: string }): void;
}

export function LinkNotePanel({ open, excludeUid, onOpenChange, onPick }: Props) {
  const [query, setQuery] = useState("");
  const search = useSearch(query, open);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  const notes = (search.data?.notes ?? []).filter((note) => note.uid !== excludeUid);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a note</DialogTitle>
          <DialogDescription>
            The link follows the note when it is renamed, and it works on your other devices.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Search notes to link"
          placeholder="Search notes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {notes.map((note) => (
            <li key={note.uid}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onPick({ title: note.title, uid: note.uid })}
              >
                <span className="block truncate font-medium">{note.title || "Untitled"}</span>
                {note.snippet && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {note.snippet}
                  </span>
                )}
              </button>
            </li>
          ))}
          {query.trim() && !search.pending && !notes.length && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">No matching notes.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
