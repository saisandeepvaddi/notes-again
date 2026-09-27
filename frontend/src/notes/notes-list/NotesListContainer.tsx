import { NoteGridSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import NotesList from "./NotesList";
import type { NotesSort, NotesSortOrder, NotesStatus } from "./useInfiniteNotes";

interface NotesListContainerProps {
  tagId?: number;
  projectId?: number;
  date?: string;
  search?: string;
  status?: NotesStatus;
  sort?: NotesSort;
  order?: NotesSortOrder;
  page?: number;
  pageSize?: number;
}

export function NotesListContainer({
  tagId,
  projectId,
  date,
  search,
  status,
  sort,
  order,
  page,
  pageSize,
}: NotesListContainerProps) {
  return (
    <div className="py-2 w-full h-full">
      <Suspense fallback={<NoteGridSkeleton />}>
        <ClientOnly>
          <NotesList
            tagId={tagId}
            projectId={projectId}
            date={date}
            search={search}
            status={status}
            sort={sort}
            order={order}
            page={page}
            pageSize={pageSize}
          />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
