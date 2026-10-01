import { useEffect, useEffectEvent } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { AppText } from "@/components/app-text";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

interface UndoBarProps {
  message: string;
  onUndo: () => void;
  onTimeout: () => void;
  disabled?: boolean;
}

export function UndoBar({ message, onUndo, onTimeout, disabled }: UndoBarProps) {
  const { colors } = useTheme();

  const expire = useEffectEvent(onTimeout);

  useEffect(() => {
    const timer = setTimeout(expire, 8000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(150)}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingLeft: 14,
          paddingRight: 4,
          minHeight: 44,
          borderRadius: radius.md,
          borderCurve: "continuous",
          backgroundColor: colors.foreground,
        }}
      >
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1, color: colors.background }}>
          {message}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={onUndo}
          disabled={disabled}
          hitSlop={6}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            paddingVertical: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <AppText style={{ fontFamily: fonts.sansSemibold, color: colors.background }}>
            Undo
          </AppText>
        </Pressable>
      </View>
    </Animated.View>
  );
}
