import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";

type SymbolNames = Extract<SymbolViewProps["name"], { ios?: unknown }>;

interface IconProps {
  ios: NonNullable<SymbolNames["ios"]>;
  android: NonNullable<SymbolNames["android"]>;
  size?: number;
  color: ColorValue;
}

export function Icon({ ios, android, size = 22, color }: IconProps) {
  return (
    <SymbolView
      name={{ ios, android, web: android }}
      size={size}
      tintColor={color}
      weight="medium"
      style={{ width: size, height: size }}
    />
  );
}
