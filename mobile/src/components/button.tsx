import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg";

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

const HEIGHT: Record<Size, number> = { sm: 36, default: 44, lg: 52 };
const FONT_SIZE: Record<Size, number> = { sm: 14, default: 15, lg: 16 };

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "default",
  disabled,
  loading,
  icon,
  haptic,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: {
      background: colors.primary,
      pressed: colors.primary,
      text: colors.primaryForeground,
      border: "transparent",
    },
    secondary: {
      background: colors.secondary,
      pressed: colors.pressed,
      text: colors.foreground,
      border: "transparent",
    },
    outline: {
      background: "transparent",
      pressed: colors.secondary,
      text: colors.foreground,
      border: colors.border,
    },
    ghost: {
      background: "transparent",
      pressed: colors.secondary,
      text: colors.foreground,
      border: "transparent",
    },
    destructive: {
      background: colors.destructiveTint,
      pressed: colors.destructiveTint,
      text: colors.destructive,
      border: "transparent",
    },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptic && process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === "sm" ? 12 : 16,
          borderRadius: radius.md,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: pressed ? palette.pressed : palette.background,
          opacity: inactive
            ? 0.5
            : pressed && (variant === "primary" || variant === "destructive")
              ? 0.8
              : 1,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {loading ? <ActivityIndicator size="small" color={palette.text} /> : icon}
        <Text
          style={{ fontFamily: fonts.sansMedium, fontSize: FONT_SIZE[size], color: palette.text }}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}
