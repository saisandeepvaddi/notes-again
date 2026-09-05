import { Suspense } from "react";
import NotesList from "./NotesList";

export function NotesListContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <NotesList />
      </div>
    </Suspense>
  );
}
