import { getFetcher } from "@/utils/fetchers";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { TagSchema } from "../new-note-form/types";

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => getFetcher("/tags/list")().then((tags) => z.array(TagSchema).parse(tags)),
  });
}
