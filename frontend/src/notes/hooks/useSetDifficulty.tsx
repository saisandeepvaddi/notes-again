import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import type { Difficulty } from "../new-note-form/types";

interface useSetDifficultyProps {
  noteId: number;
}

export function useSetDifficulty({ noteId }: useSetDifficultyProps) {
  return useMutation({
    mutationKey: ["set-difficulty", noteId],
    mutationFn: async (difficulty: Difficulty) => {
      const fetcher = patchFetcher(`/notes/${noteId}/difficulty`);
      return await fetcher(JSON.stringify({ difficulty }));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
