import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SettingsSchema } from "./types";

export function useSettings() {
  return useSuspenseQuery({
    queryKey: ["settings"],
    queryFn: () => getFetcher("/settings")().then((data) => SettingsSchema.parse(data)),
  });
}
