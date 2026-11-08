import { formatDistanceToNowStrict } from "date-fns";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import {
  type SyncConflict,
  useConnectSync,
  useDisconnectSync,
  useResolveConflict,
  useSyncConflicts,
  useSyncNow,
  useSyncStatus,
} from "@/api/sync";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { Divider, SettingRow } from "@/components/setting-row";
import { TextField } from "@/components/text-field";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function ManualConnect() {
  const router = useRouter();
  const connect = useConnectSync();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await connect.mutateAsync({ url: url.trim(), username: username.trim(), password });
      setPassword("");
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <Card>
      <AppText variant="heading">Sync with a server or computer</AppText>
      <AppText tone="muted">
        Your notes live on this phone. Connect a Notes Again server, or the desktop app on the same
        Wi-Fi, to keep them in sync everywhere. Edits made offline sync when you’re back.
      </AppText>
      <Button onPress={() => router.push("/sync-scan")}>Scan a QR code</Button>
      <Divider color="transparent" />
      <AppText variant="label" tone="muted">
        Or sign in to a server
      </AppText>
      <TextField
        placeholder="Server address"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TextField
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error ? <InlineError message={error} /> : null}
      <Button
        variant="outline"
        onPress={() => void submit()}
        loading={connect.isPending}
        disabled={!url.trim() || !username.trim() || !password}
      >
        Connect
      </Button>
    </Card>
  );
}

function ConflictRow({ conflict }: { conflict: SyncConflict }) {
  const resolve = useResolveConflict();
  const keep = (name: string, content: string) =>
    void resolve
      .mutateAsync({ noteId: conflict.note_id, name, content })
      .catch((error: unknown) => Alert.alert("Couldn’t resolve it", errorText(error)));
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">{conflict.name || "Untitled"}</AppText>
      <AppText variant="caption" tone="muted">
        Edited here and somewhere else. Pick the version to keep; the other is replaced everywhere.
      </AppText>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            variant="outline"
            size="sm"
            loading={resolve.isPending}
            onPress={() => keep(conflict.name, conflict.content)}
          >
            Keep this phone’s
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            variant="outline"
            size="sm"
            loading={resolve.isPending}
            onPress={() => keep(conflict.their_name, conflict.their_content)}
          >
            Keep the other
          </Button>
        </View>
      </View>
    </View>
  );
}

export function SyncScreen() {
  const { colors } = useTheme();
  const status = useSyncStatus();
  const conflicts = useSyncConflicts(status.data?.connected === true);
  const syncNow = useSyncNow();
  const disconnect = useDisconnectSync();

  if (status.error)
    return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
  if (!status.data) return <LoadingState />;
  const sync = status.data;

  const confirmDisconnect = () =>
    Alert.alert(
      "Stop syncing?",
      "Your notes stay on this phone. They stop syncing with the server until you connect again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop syncing",
          style: "destructive",
          onPress: () =>
            void disconnect
              .mutateAsync()
              .catch((error: unknown) => Alert.alert("Couldn’t disconnect", errorText(error))),
        },
      ],
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 40 }}
    >
      {sync.connected ? (
        <Card>
          <AppText variant="heading">Syncing</AppText>
          <SettingRow
            label="With"
            description={sync.username ? `${sync.url} (${sync.username})` : (sync.url ?? "")}
          />
          <Divider color={colors.border} />
          <SettingRow
            label="Last synced"
            description={
              sync.syncing
                ? "Syncing now…"
                : sync.last_synced_at
                  ? formatDistanceToNowStrict(sync.last_synced_at, { addSuffix: true })
                  : "Not yet"
            }
          />
          {sync.pending ? (
            <AppText variant="caption" tone="muted">
              Changes on this phone are waiting to sync.
            </AppText>
          ) : null}
          {sync.last_error ? <InlineError message={sync.last_error} /> : null}
          <Button
            variant="outline"
            onPress={() => void syncNow.mutateAsync().catch(() => undefined)}
            loading={syncNow.isPending || sync.syncing}
          >
            Sync now
          </Button>
          <Button variant="ghost" onPress={confirmDisconnect} loading={disconnect.isPending}>
            Stop syncing
          </Button>
        </Card>
      ) : (
        <ManualConnect />
      )}
      {conflicts.data && conflicts.data.length > 0 ? (
        <Card>
          <AppText variant="heading">Changed in two places</AppText>
          {conflicts.data.map((conflict) => (
            <ConflictRow key={conflict.note_id} conflict={conflict} />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
