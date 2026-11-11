import { useLocalSearchParams } from "expo-router";
import { HistoryScreen } from "@/screens/history";

export default function HistoryNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HistoryScreen key={id} id={Number(id)} />;
}
