import { getDifficulty, DIFFICULTY_OPTIONS } from "@web/notes/difficulty";
import type { NoteItem } from "@web/notes/new-note-form/types";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Badge } from "@/components/badge";
import { useTheme } from "@/hooks/use-theme";
import { difficultyTint, radius } from "@/theme";
import { dueLabel, noteExcerpt, noteTitle } from "@/utils/note-format";

export const NoteRow = memo(function NoteRow({ note }: { note: NoteItem }) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const difficulty = getDifficulty(note.tags);
  const difficultyLabel = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label;
  const due = dueLabel(note);
  const excerpt = noteExcerpt(note);
  const tags = note.tags.filter((tag) => !tag.is_difficulty);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/note/${note.id}`)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.pressed : colors.card,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.hairline,
        padding: 14,
        gap: 8,
      })}
    >
      <AppText variant="heading" numberOfLines={2}>
        {noteTitle(note)}
      </AppText>
      {excerpt ? (
        <AppText variant="caption" tone="muted" numberOfLines={2}>
          {excerpt}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {difficultyLabel ? (
          <Badge label={difficultyLabel} tint={difficultyTint(difficulty, scheme)} />
        ) : null}
        {note.project ? <Badge label={note.project.name} /> : null}
        {tags.slice(0, 2).map((tag) => (
          <Badge key={tag.id} label={`#${tag.name}`} />
        ))}
        <View style={{ flex: 1 }} />
        <AppText variant="label" tone={due.due ? "primary" : "muted"}>
          {due.text}
        </AppText>
      </View>
    </Pressable>
  );
});
