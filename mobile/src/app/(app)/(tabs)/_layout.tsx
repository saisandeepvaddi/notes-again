import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDueNotes } from "@/api/notes";
import { useTheme } from "@/hooks/use-theme";
import { formatCount } from "@/utils/note-format";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { data } = useDueNotes();
  const due = data?.pages[0]?.total ?? 0;

  return (
    <NativeTabs tintColor={colors.primary} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="(index)">
        <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} md="today" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        {due > 0 ? <NativeTabs.Trigger.Badge>{formatCount(due)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(notes)">
        <NativeTabs.Trigger.Icon sf={{ default: "book", selected: "book.fill" }} md="menu_book" />
        <NativeTabs.Trigger.Label>Notes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(settings)">
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
