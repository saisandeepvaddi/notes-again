import { useColorScheme } from "react-native";
import { palettes, type Scheme } from "@/theme";

export function useTheme() {
  const scheme: Scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { scheme, colors: palettes[scheme] };
}
