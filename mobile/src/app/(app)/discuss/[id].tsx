import { useLocalSearchParams } from "expo-router";
import { DiscussionScreen } from "@/screens/discussion";

export default function DiscussNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DiscussionScreen key={id} id={Number(id)} />;
}
