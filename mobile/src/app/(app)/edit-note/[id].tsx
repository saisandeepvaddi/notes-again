import { useLocalSearchParams } from "expo-router";
import { EditNoteScreen } from "@/screens/note-form";

export default function EditNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditNoteScreen id={Number(id)} />;
}
