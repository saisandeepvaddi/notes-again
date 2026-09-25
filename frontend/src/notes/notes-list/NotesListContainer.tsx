import { NoteGridSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import NotesList from "./NotesList";

interface NotesListContainerProps {
  tagId?: number;
  projectId?: number;
  initialDate?: Date;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function NotesListContainer({
  tagId,
  projectId,
  initialDate,
  search,
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
            initialDate={initialDate}
            search={search}
            page={page}
            pageSize={pageSize}
          />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
