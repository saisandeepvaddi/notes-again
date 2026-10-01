import { DIFFICULTY_OPTIONS, getDifficulty } from "@web/notes/difficulty";
import type { NoteItem } from "@web/notes/new-note-form/types";
import { View } from "react-native";
import { Badge } from "@/components/badge";
import { useTheme } from "@/hooks/use-theme";
import { difficultyTint } from "@/theme";

export function NoteMeta({ note }: { note: NoteItem }) {
  const { scheme } = useTheme();
  const difficulty = getDifficulty(note.tags);
  const label = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label ?? "";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      <Badge label={label} tint={difficultyTint(difficulty, scheme)} />
      {note.project ? <Badge label={note.project.name} /> : null}
      {note.tags
        .filter((tag) => !tag.is_difficulty)
        .map((tag) => (
          <Badge key={tag.id} label={`#${tag.name}`} />
        ))}
    </View>
  );
}
