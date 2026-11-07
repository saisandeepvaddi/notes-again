import { Host, Picker } from "@expo/ui";
import type { Algorithm } from "@web/notes/new-note-form/types";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useConnection } from "@/api/connection";
import { useAppSettings, useSetDefaultAlgorithm } from "@/api/library";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { NavRow } from "@/components/nav-row";
import { InlineError } from "@/components/screen-state";
import { Divider, SettingRow } from "@/components/setting-row";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";
import { ReadingFontPicker } from "./reading-font-picker";

const METHOD_LABELS = {
  password: "Username and password",
  token: "API token",
  open: "Sign-in turned off",
} as const;

const ALGORITHMS: { value: Algorithm; label: string; hint: string }[] = [
  { value: "fsrs", label: "FSRS", hint: "Adapts to how well you remember each note. Recommended." },
  { value: "sm2", label: "SM-2", hint: "The classic Anki-style schedule." },
];

function SchedulingCard() {
  const { colors, scheme } = useTheme();
  const settings = useAppSettings();
  const setAlgorithm = useSetDefaultAlgorithm();
  const current = settings.data?.default_algorithm;
  const hint = ALGORITHMS.find((option) => option.value === current)?.hint;
  return (
    <Card>
      <AppText variant="heading">Review</AppText>
      <SettingRow label="Schedule new notes with" description={hint}>
        {current ? (
          <Host matchContents colorScheme={scheme} seedColor={colors.primary}>
            <Picker
              selectedValue={current}
              onValueChange={(value) => setAlgorithm.mutate(value as Algorithm)}
              enabled={!setAlgorithm.isPending}
            >
              {ALGORITHMS.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </Host>
        ) : null}
      </SettingRow>
      <AppText variant="caption" tone="muted">
        Existing notes keep the schedule they started with.
      </AppText>
      {setAlgorithm.error ? <InlineError message={setAlgorithm.error.message} /> : null}
      {settings.error ? <InlineError message={settings.error.message} /> : null}
    </Card>
  );
}

export function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
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
        <AppText variant="heading">Appearance</AppText>
        <SettingRow
          label="Reading font"
          description="Used for note titles and note text. Saved on this device."
        />
        <ReadingFontPicker />
      </Card>

      <SchedulingCard />

      <Card>
        <AppText variant="heading">Library</AppText>
        <NavRow
          label="Projects & tags"
          description="Pause, resume or delete them"
          ios="folder"
          android="folder"
          onPress={() => router.push("/organize")}
        />
        <Divider color={colors.border} />
        <NavRow
          label="Trash"
          description="Restore or delete notes for good"
          ios="trash"
          android="delete"
          onPress={() => router.push("/trash")}
        />
        <Divider color={colors.border} />
        <NavRow
          label="Import & export"
          description="Move notes in and out as JSON"
          ios="square.and.arrow.up.on.square"
          android="import_export"
          onPress={() => router.push("/transfer")}
        />
      </Card>

      <Card>
        <AppText variant="heading">On the desktop or web app</AppText>
        <AppText tone="muted">
          API tokens, sign-in settings and backups are managed from the desktop or web app, where
          you’re signed in with your account rather than a device token.
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
