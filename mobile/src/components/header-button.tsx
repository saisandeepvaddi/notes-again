import { Pressable } from "react-native";
import { Icon } from "@/components/icon";
import { useTheme } from "@/hooks/use-theme";

type IconProps = Parameters<typeof Icon>[0];

interface HeaderButtonProps {
  ios: IconProps["ios"];
  android: IconProps["android"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function HeaderButton({ ios, android, label, onPress, disabled }: HeaderButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Icon ios={ios} android={android} color={colors.primary} />
    </Pressable>
  );
}
