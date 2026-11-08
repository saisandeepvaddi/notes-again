import { Stack } from "expo-router";
import { useStackOptions } from "@/hooks/use-stack-options";

export default function AppLayout() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="note/[id]" options={{ title: "" }} />
      <Stack.Screen
        name="review"
        options={{ presentation: "fullScreenModal", headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="new-note" options={{ presentation: "modal", title: "New note" }} />
      <Stack.Screen name="trash" options={{ title: "Trash" }} />
      <Stack.Screen name="organize" options={{ title: "Projects & tags" }} />
      <Stack.Screen name="transfer" options={{ title: "Import & export" }} />
      <Stack.Screen name="sync" options={{ title: "Sync" }} />
      <Stack.Screen
        name="sync-scan"
        options={{ presentation: "fullScreenModal", headerShown: false }}
      />
    </Stack>
  );
}
