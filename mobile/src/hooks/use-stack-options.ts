import type { ComponentProps } from "react";
import type { Stack } from "expo-router";
import { useTheme } from "@/hooks/use-theme";
import { fonts } from "@/theme";

type StackOptions = NonNullable<ComponentProps<typeof Stack>["screenOptions"]>;

export function useStackOptions(): Exclude<StackOptions, (...args: never[]) => unknown> {
  const { colors } = useTheme();
  return {
    headerTintColor: colors.primary,
    headerTitleStyle: { fontFamily: fonts.sansSemibold, color: colors.foreground },
    headerLargeTitleStyle: { fontFamily: fonts.sansSemibold, color: colors.foreground },
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerBackButtonDisplayMode: "minimal",
    contentStyle: { backgroundColor: colors.background },
  };
}
