import { getDifficulty, DIFFICULTY_OPTIONS } from "@web/notes/difficulty";
import type { NoteItem } from "@web/notes/new-note-form/types";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Badge } from "@/components/badge";
import { Icon } from "@/components/icon";
import { useTheme } from "@/hooks/use-theme";
import { difficultyTint, radius } from "@/theme";
import { dueLabel, noteExcerpt, noteTitle } from "@/utils/note-format";

interface NoteRowProps {
  note: NoteItem;
  selected?: boolean;
  onToggle?: (id: number) => void;
}

export const NoteRow = memo(function NoteRow({ note, selected, onToggle }: NoteRowProps) {
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const difficulty = getDifficulty(note.tags);
  const difficultyLabel = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.label;
  const due = dueLabel(note);
  const excerpt = noteExcerpt(note);
  const tags = note.tags.filter((tag) => !tag.is_difficulty);

  return (
    <Pressable
      accessibilityRole={onToggle ? "checkbox" : "link"}
      accessibilityState={onToggle ? { checked: selected === true } : undefined}
      onPress={() => (onToggle ? onToggle(note.id) : router.push(`/note/${note.id}`))}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.pressed : colors.card,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.hairline,
        padding: 14,
        gap: 8,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <AppText variant="heading" reading numberOfLines={2} style={{ flex: 1 }}>
          {noteTitle(note)}
        </AppText>
        {onToggle ? (
          <Icon
            ios={selected ? "checkmark.circle.fill" : "circle"}
            android={selected ? "check_circle" : "radio_button_unchecked"}
            color={selected ? colors.primary : colors.mutedForeground}
          />
        ) : null}
      </View>
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
