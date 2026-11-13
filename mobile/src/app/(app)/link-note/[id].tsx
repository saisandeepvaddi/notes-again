import { useLocalSearchParams } from "expo-router";
import { LinkNoteScreen } from "@/screens/link-note";

export default function LinkNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LinkNoteScreen sourceId={Number(id)} />;
}
