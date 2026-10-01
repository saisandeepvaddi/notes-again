import { RATING_OPTIONS } from "@web/notes/rating";
import type { Rating } from "@web/notes/new-note-form/types";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius, ratingTint } from "@/theme";

interface RatingBarProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

export function RatingBar({ onRate, disabled }: RatingBarProps) {
  const { scheme } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {RATING_OPTIONS.map((option) => {
        const tint = ratingTint(option.value, scheme);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`${option.label}: ${option.caption}`}
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
              {option.caption}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
