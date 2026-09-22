import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ApiTokenSchema } from "./types";

export function useApiTokens() {
  return useSuspenseQuery({
    queryKey: ["api-tokens"],
    queryFn: () => getFetcher("/tokens/list")().then((data) => z.array(ApiTokenSchema).parse(data)),
  });
}
