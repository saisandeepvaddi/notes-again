import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts } from "@/theme";

interface HeaderTextButtonProps {
  label: string;
  onPress: () => void;
  prominent?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export function HeaderTextButton({
  label,
  onPress,
  prominent,
  disabled,
  loading,
}: HeaderTextButtonProps) {
  const { colors } = useTheme();
  if (loading) return <ActivityIndicator color={colors.primary} style={{ paddingHorizontal: 8 }} />;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      style={({ pressed }) => ({
        paddingHorizontal: 6,
        paddingVertical: 6,
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: prominent ? fonts.sansSemibold : fonts.sans,
          fontSize: 17,
          color: colors.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
