import { Platform } from "react-native";
import type { Difficulty, Rating } from "@web/notes/new-note-form/types";

const light = {
  background: "#fbfaf7",
  foreground: "#1d1713",
  card: "#ffffff",
  shelf: "#f7f5f1",
  primary: "#227c45",
  primaryForeground: "#fdfcf8",
  primaryTint: "#227c451a",
  secondary: "#f2f0ec",
  pressed: "#efece7",
  mutedForeground: "#6e6862",
  border: "#e2dfda",
  hairline: "#1d17131a",
  destructive: "#e7000b",
  destructiveTint: "#e7000b1a",
};

const dark: typeof light = {
  background: "#110f0d",
  foreground: "#f0eeea",
  card: "#191714",
  shelf: "#161311",
  primary: "#5ebc7b",
  primaryForeground: "#09120b",
  primaryTint: "#5ebc7b1f",
  secondary: "#24211e",
  pressed: "#292622",
  mutedForeground: "#9c9792",
  border: "#ffffff1a",
  hairline: "#ffffff1a",
  destructive: "#ff6467",
  destructiveTint: "#ff646726",
};

export type Palette = typeof light;
export const palettes = { light, dark };

type Tint = { background: string; foreground: string };

const tints = {
  teal: {
    light: { background: "#00bba726", foreground: "#005f5a" },
    dark: { background: "#00bba726", foreground: "#00d5be" },
  },
  amber: {
    light: { background: "#fe9a0026", foreground: "#973c00" },
    dark: { background: "#fe9a0026", foreground: "#ffb900" },
  },
  red: {
    light: { background: "#fb2c3626", foreground: "#9f0712" },
    dark: { background: "#fb2c3626", foreground: "#ff6467" },
  },
  redStrong: {
    light: { background: "#fb2c3626", foreground: "#c10007" },
    dark: { background: "#fb2c3626", foreground: "#ff6467" },
  },
  blue: {
    light: { background: "#2b7fff26", foreground: "#1447e6" },
    dark: { background: "#2b7fff26", foreground: "#51a2ff" },
  },
  emerald: {
    light: { background: "#00bc7d26", foreground: "#006045" },
    dark: { background: "#00bc7d26", foreground: "#00d492" },
  },
} satisfies Record<string, Record<"light" | "dark", Tint>>;

export type Scheme = "light" | "dark";

const DIFFICULTY_TINT: Record<Difficulty, keyof typeof tints> = {
  easy: "teal",
  medium: "amber",
  hard: "red",
};

const RATING_TINT: Record<Rating, keyof typeof tints> = {
  again: "redStrong",
  hard: "amber",
  good: "blue",
  easy: "emerald",
};

export const difficultyTint = (difficulty: Difficulty, scheme: Scheme): Tint =>
  tints[DIFFICULTY_TINT[difficulty]][scheme];

export const ratingTint = (rating: Rating, scheme: Scheme): Tint =>
  tints[RATING_TINT[rating]][scheme];

export const fonts = {
  serif: "Literata_400Regular",
  serifItalic: "Literata_400Regular_Italic",
  serifSemibold: "Literata_600SemiBold",
  sans: "Inter_400Regular",
  sansMedium: "Inter_500Medium",
  sansSemibold: "Inter_600SemiBold",
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
};

export const radius = {
  sm: 7,
  md: 10,
  lg: 12,
  xl: 17,
  full: 999,
};

export const space = {
  gutter: 16,
};
