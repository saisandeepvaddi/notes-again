import { Text, type TextProps, type TextStyle } from "react-native";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";
import { fonts } from "@/theme";

type Variant = "body" | "caption" | "label" | "title" | "heading" | "display" | "mono";
type Tone = "default" | "muted" | "primary" | "destructive";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.sansSemibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7 },
  title: { fontFamily: fonts.sansSemibold, fontSize: 22, lineHeight: 29, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 23, letterSpacing: -0.2 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
};

const SEMIBOLD_VARIANTS = new Set<Variant>(["display", "title", "heading"]);

interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
  reading?: boolean;
}

export function AppText({
  variant = "body",
  tone = "default",
  reading = false,
  style,
  ...props
}: AppTextProps) {
  const { colors } = useTheme();
  const { font, family } = useReadingFont();
  const color = {
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    destructive: colors.destructive,
  }[tone];
  const readingStyle: TextStyle | null = reading
    ? {
        fontFamily: SEMIBOLD_VARIANTS.has(variant) ? family.semibold : family.regular,
        ...(font === "serif" ? { letterSpacing: 0 } : null),
      }
    : null;
  return <Text {...props} style={[VARIANTS[variant], readingStyle, { color }, style]} />;
}
