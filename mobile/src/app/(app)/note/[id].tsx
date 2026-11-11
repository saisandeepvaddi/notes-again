import { useLocalSearchParams } from "expo-router";
import { NoteDetailScreen } from "@/screens/note-detail";

export default function NoteDetail() {
  const { id, r } = useLocalSearchParams<{ id: string; r?: string }>();
  return <NoteDetailScreen key={r ?? "0"} id={Number(id)} />;
}
