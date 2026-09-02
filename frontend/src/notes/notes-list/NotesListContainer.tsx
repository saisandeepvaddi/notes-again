import { Suspense } from "react";
import NotesList from "./NotesList";

export function NotesListContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <NotesList />
    </Suspense>
  );
}
