import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { ProjectSchema } from "../new-note-form/types";

export function useCreateProject() {
  return useMutation({
    mutationKey: ["create-project"],
    mutationFn: async (name: string) => {
      const fetcher = postFetcher("/projects/create");
      const project = await fetcher(JSON.stringify({ name }));
      return ProjectSchema.parse(project);
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
