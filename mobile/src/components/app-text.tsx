import { Text, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts } from "@/theme";

type Variant = "body" | "caption" | "label" | "title" | "heading" | "display" | "mono";
type Tone = "default" | "muted" | "primary" | "destructive";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.serifSemibold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.serifSemibold, fontSize: 22, lineHeight: 29 },
  heading: { fontFamily: fonts.serifSemibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
};

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

export function AppText({ variant = "body", tone = "default", style, ...props }: AppTextProps) {
  const { colors } = useTheme();
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    destructive: colors.destructive,
  }[tone];
  return <Text {...props} style={[VARIANTS[variant], { color }, style]} />;
}
