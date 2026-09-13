import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useSetProjectProps {
  noteId: number;
}

export function useSetProject({ noteId }: useSetProjectProps) {
  return useMutation({
    mutationKey: ["set-project", noteId],
    mutationFn: async (projectId: number | null) => {
      const fetcher = patchFetcher(`/notes/${noteId}/project`);
      return await fetcher(JSON.stringify({ project_id: projectId }));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
