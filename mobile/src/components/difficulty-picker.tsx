import { DIFFICULTY_OPTIONS } from "@web/notes/difficulty";
import type { Difficulty } from "@web/notes/new-note-form/types";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { difficultyTint, fonts, radius } from "@/theme";

interface DifficultyPickerProps {
  value: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  disabled?: boolean;
}

export function DifficultyPicker({ value, onChange, disabled }: DifficultyPickerProps) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: "row",
        padding: 3,
        gap: 3,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: colors.secondary,
      }}
    >
      {DIFFICULTY_OPTIONS.map((option) => {
        const selected = option.value === value;
        const tint = difficultyTint(option.value, scheme);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => !selected && onChange(option.value)}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              borderCurve: "continuous",
              backgroundColor: selected ? colors.card : "transparent",
              boxShadow: selected ? "0 1px 2px rgba(0, 0, 0, 0.08)" : undefined,
            }}
          >
            <Text
              style={{
                fontFamily: selected ? fonts.sansSemibold : fonts.sansMedium,
                fontSize: 14,
                color: selected ? tint.foreground : colors.mutedForeground,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
