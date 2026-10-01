import { useLocalSearchParams } from "expo-router";
import { NoteDetailScreen } from "@/screens/note-detail";

export default function NoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NoteDetailScreen id={Number(id)} />;
}
