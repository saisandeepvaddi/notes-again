import { Stack } from "expo-router";
import { useStackOptions } from "@/hooks/use-stack-options";

const ROOTS = { index: "Today", notes: "Notes" } as const;

export default function TabStackLayout({ segment }: { segment: string }) {
  const options = useStackOptions();
  const root = segment === "(notes)" ? "notes" : "index";
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name={root} options={{ title: ROOTS[root], headerLargeTitleEnabled: true }} />
    </Stack>
  );
}
