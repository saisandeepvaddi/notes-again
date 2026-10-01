import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { useTheme } from "@/hooks/use-theme";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center", gap: 12 }}>
      <ActivityIndicator color={colors.primary} />
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
    </View>
  );
}

interface MessageStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
}

export function MessageState({ title, message, action }: MessageStateProps) {
  return (
    <View style={{ paddingVertical: 40, paddingHorizontal: 24, alignItems: "center", gap: 8 }}>
      <AppText variant="heading" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      {message ? (
        <AppText selectable tone="muted" style={{ textAlign: "center" }}>
          {message}
        </AppText>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <MessageState
      title="Couldn't load this"
      message={error instanceof Error ? error.message : "Something went wrong."}
      action={
        <Button variant="outline" size="sm" onPress={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

export function InlineError({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.destructiveTint,
        borderRadius: 10,
        borderCurve: "continuous",
        padding: 12,
      }}
    >
      <AppText selectable variant="caption" tone="destructive">
        {message}
      </AppText>
    </View>
  );
}
