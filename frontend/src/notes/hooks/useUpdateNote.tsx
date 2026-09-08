import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useUpdateNoteProps {
  noteId: number;
}

interface UpdateNoteData {
  reviewed_at?: Date;
}

export function useUpdateNote({ noteId }: useUpdateNoteProps) {
  return useMutation({
    mutationKey: ["note-update", noteId],
    mutationFn: async ({ reviewed_at }: UpdateNoteData) => {
      const fetcher = patchFetcher(`/notes/${noteId}`);
      return await fetcher(
        JSON.stringify({
          reviewed_at: reviewed_at,
        }),
      );
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({
        queryKey: ["notes"],
      });
    },
  });
}
