import { Pressable, Text, View } from "react-native";
import { AppText } from "@/components/app-text";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";
import { radius, readingFonts, type ReadingFont } from "@/theme";

const OPTIONS: { value: ReadingFont; label: string }[] = [
  { value: "sans", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
];

export function ReadingFontPicker() {
  const { colors } = useTheme();
  const { font, setFont } = useReadingFont();
  return (
    <View style={{ gap: 12 }}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Reading font"
        style={{
          flexDirection: "row",
          padding: 3,
          gap: 3,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors.secondary,
        }}
      >
        {OPTIONS.map((option) => {
          const selected = option.value === font;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => !selected && setFont(option.value)}
              style={{
                flex: 1,
                minHeight: 44,
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
                  fontFamily: readingFonts[option.value].semibold,
                  fontSize: 15,
                  color: selected ? colors.foreground : colors.mutedForeground,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <AppText reading style={{ fontSize: 17, lineHeight: 26 }}>
        Spaced repetition turns what you read into what you remember.
      </AppText>
    </View>
  );
}
