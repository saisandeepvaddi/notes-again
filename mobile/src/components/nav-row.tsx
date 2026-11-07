import { Pressable, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Icon } from "@/components/icon";
import { useTheme } from "@/hooks/use-theme";

type IconProps = Parameters<typeof Icon>[0];

interface NavRowProps {
  label: string;
  description?: string;
  ios: IconProps["ios"];
  android: IconProps["android"];
  onPress: () => void;
}

export function NavRow({ label, description, ios, android, onPress }: NavRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 44,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon ios={ios} android={android} color={colors.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" style={{ fontSize: 15, lineHeight: 20 }}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Icon ios="chevron.right" android="chevron_right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}
