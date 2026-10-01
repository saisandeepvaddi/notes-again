import { Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

interface BadgeProps {
  label: string;
  tint?: { background: string; foreground: string };
}

export function Badge({ label, tint }: BadgeProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        borderRadius: radius.full,
        paddingHorizontal: 9,
        paddingVertical: 3,
        backgroundColor: tint?.background ?? colors.secondary,
        maxWidth: 180,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 12,
          lineHeight: 16,
          color: tint?.foreground ?? colors.mutedForeground,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
