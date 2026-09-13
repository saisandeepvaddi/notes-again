import { useTags } from "./useTags";

// Projects are just tags with is_project=true, swapped sticky like difficulty
// -- there's one shared tags cache, so no separate query here.
export function useProjects() {
  const query = useTags();
  return { ...query, data: query.data?.filter((tag) => tag.is_project) };
}
