import { Stack } from "expo-router";
import { useStackOptions } from "@/hooks/use-stack-options";

export default function SettingsLayout() {
  const options = useStackOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen
        name="settings"
        options={{ title: "Settings", headerLargeTitleEnabled: true }}
      />
    </Stack>
  );
}
