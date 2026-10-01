import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useConnection } from "@/api/connection";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Divider, SettingRow } from "@/components/setting-row";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const METHOD_LABELS = {
  password: "Username and password",
  token: "API token",
  open: "Sign-in turned off",
} as const;

export function SettingsScreen() {
  const { colors } = useTheme();
  const { connection, disconnect } = useConnection();
  const [leaving, setLeaving] = useState(false);
  if (!connection) return null;

  const signOut = () =>
    Alert.alert(
      "Sign out?",
      connection.method === "password"
        ? "This device’s token is revoked on the server. Sign in again to reconnect."
        : connection.method === "token"
          ? "The token is removed from this device. Revoke it on the web app if you won’t use it again."
          : "You’ll need to enter the server address again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            setLeaving(true);
            void disconnect().finally(() => setLeaving(false));
          },
        },
      ],
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 40 }}
    >
      <Card>
        <AppText variant="heading">Connection</AppText>
        <SettingRow label="Server" description={connection.serverUrl} />
        <Divider color={colors.border} />
        <SettingRow
          label="Signed in with"
          description={
            connection.method === "password" && connection.username
              ? `${METHOD_LABELS.password} (${connection.username})`
              : METHOD_LABELS[connection.method]
          }
        />
        <Button
          variant="outline"
          onPress={() => void WebBrowser.openBrowserAsync(connection.serverUrl)}
        >
          Open the web app
        </Button>
      </Card>

      <Card>
        <AppText variant="heading">On the web app</AppText>
        <AppText tone="muted">
          Import, organize projects and tags, manage the trash, and change scheduling settings from
          the web app. Everything you do here syncs with it.
        </AppText>
      </Card>

      <Button variant="destructive" onPress={signOut} loading={leaving}>
        Sign out
      </Button>
      <AppText variant="caption" tone="muted" style={{ textAlign: "center" }}>
        Notes Again {Constants.expoConfig?.version ?? ""}
      </AppText>
    </ScrollView>
  );
}
