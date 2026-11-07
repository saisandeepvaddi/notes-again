import { RATING_OPTIONS } from "@web/notes/rating";
import type { Rating } from "@web/notes/new-note-form/types";
import type { NoteIntervals } from "@/api/notes";
import { formatDistanceToNowStrict } from "date-fns";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius, ratingTint } from "@/theme";

interface RatingBarProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
  intervals?: NoteIntervals;
}

export function RatingBar({ onRate, disabled, intervals }: RatingBarProps) {
  const { scheme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {RATING_OPTIONS.map((option) => {
        const tint = ratingTint(option.value, scheme);
        const next = intervals?.[option.value];
        const caption = next ? formatDistanceToNowStrict(next) : option.caption;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={
              next ? `${option.label}: next review in ${caption}` : `${option.label}: ${caption}`
            }
            disabled={disabled}
            onPress={() => {
              if (process.env.EXPO_OS !== "web") {
                void Haptics.impactAsync(
                  option.value === "again"
                    ? Haptics.ImpactFeedbackStyle.Medium
                    : Haptics.ImpactFeedbackStyle.Light,
                );
              }
              onRate(option.value);
            }}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 58,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              paddingHorizontal: 4,
              borderRadius: radius.md,
              borderCurve: "continuous",
              backgroundColor: tint.background,
              opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 15, color: tint.foreground }}>
              {option.label}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontFamily: fonts.sans,
                fontSize: 11,
                color: tint.foreground,
                opacity: 0.85,
              }}
            >
              {caption}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
