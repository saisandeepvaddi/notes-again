import { Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: 14,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: selected ? "transparent" : colors.border,
        backgroundColor: selected ? colors.primaryTint : pressed ? colors.secondary : colors.card,
      })}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: selected ? fonts.sansSemibold : fonts.sansMedium,
          fontSize: 14,
          color: selected ? colors.primary : colors.foreground,
          maxWidth: 200,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
