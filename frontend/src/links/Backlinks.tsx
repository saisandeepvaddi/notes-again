import { Link } from "@tanstack/react-router";
import { useBacklinks } from "./api";

export function Backlinks({ noteId }: { noteId: number }) {
  const { data } = useBacklinks(noteId);
  if (!data?.length) return null;
  return (
    <section aria-label="Linked from" className="note-column mt-10 border-t pt-4">
      <h2 className="mb-2 text-xs font-medium text-muted-foreground">
        Linked from {data.length} {data.length === 1 ? "note" : "notes"}
      </h2>
      <ul className="flex flex-col gap-1">
        {data.map((link) => (
          <li key={link.id}>
            <Link
              to="/notes/$noteId"
              params={{ noteId: String(link.id) }}
              className="block rounded-md px-2 py-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="block truncate text-sm font-medium">{link.title || "Untitled"}</span>
              <span className="block truncate text-xs text-muted-foreground">{link.snippet}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
