import type { ReactNode } from "react";
import { View } from "react-native";
import { AppText } from "@/components/app-text";

interface SettingRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" style={{ fontSize: 15, lineHeight: 20 }}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="muted" selectable>
            {description}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Divider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color }} />;
}
