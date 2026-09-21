import { getFetcher } from "@/utils/fetchers";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ProjectListItemSchema } from "../new-note-form/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () =>
      getFetcher("/projects/list")().then((projects) => z.array(ProjectListItemSchema).parse(projects)),
  });
}
