import { Host, Picker, Switch } from "@expo/ui";
import { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { PROVIDERS } from "@web/discussion/core";
import { forgetCredentials, saveCredentials } from "@web/discussion/credentials";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { InlineError, LoadingState } from "@/components/screen-state";
import { TextField } from "@/components/text-field";
import { SettingRow } from "@/components/setting-row";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";
import { useDiscussionCredentials } from "@/discussion/credentials";

export function DiscussionSettingsScreen() {
  const stored = useDiscussionCredentials();
  if (!stored.ready) return <LoadingState />;
  return <DiscussionSettingsForm stored={stored} />;
}

function DiscussionSettingsForm({
  stored,
}: {
  stored: ReturnType<typeof useDiscussionCredentials>;
}) {
  const { colors, scheme } = useTheme();
  const [config, setConfig] = useState(stored.config);
  const [remember, setRemember] = useState(stored.remembered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveCredentials(config, remember);
      setMessage(
        remember
          ? "Saved securely on this device."
          : "Ready for this app session. Restarting clears the key.",
      );
    } catch {
      setError(
        "Could not save these settings. Check the model and API key, or try turning off Remember on this device.",
      );
    } finally {
      setBusy(false);
    }
  };
  const forget = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await forgetCredentials();
      setMessage("Key removed from this session and secure storage.");
    } catch {
      setError("Could not remove the saved key. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 40 }}
    >
      <AppText tone="muted">
        Discuss a saved note using your own provider account. Nothing is sent until you press Send.
      </AppText>
      <Card>
        <SettingRow label="Provider">
          <Host matchContents colorScheme={scheme}>
            <Picker
              selectedValue={config.provider}
              enabled={!busy}
              onValueChange={(value) => {
                const provider = PROVIDERS.find((item) => item.value === value);
                if (provider)
                  setConfig({ provider: provider.value, model: provider.model, apiKey: "" });
              }}
            >
              {PROVIDERS.map((provider) => (
                <Picker.Item key={provider.value} label={provider.label} value={provider.value} />
              ))}
            </Picker>
          </Host>
        </SettingRow>
        <TextField
          label="Model ID"
          accessibilityLabel="AI model ID"
          value={config.model}
          onChangeText={(model) => setConfig({ ...config, model })}
          maxLength={120}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextField
          label="Provider API key"
          accessibilityLabel="AI provider API key"
          value={config.apiKey}
          onChangeText={(apiKey) => setConfig({ ...config, apiKey })}
          maxLength={512}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
        />
        <SettingRow
          label="Remember on this device"
          description="Use iOS Keychain. The key does not sync or enter note backups."
        >
          <Host matchContents colorScheme={scheme}>
            <Switch value={remember} onValueChange={setRemember} disabled={busy} />
          </Host>
        </SettingRow>
        <Button onPress={() => void save()} loading={busy}>
          Save Discuss settings
        </Button>
        <Button variant="outline" onPress={() => void forget()} disabled={busy}>
          Forget key
        </Button>
      </Card>
      {(error || stored.error) && (
        <InlineError message={error || stored.error || "Could not load settings."} />
      )}
      {message && (
        <AppText accessibilityRole="text" selectable tone="muted">
          {message}
        </AppText>
      )}
      <AppText variant="caption" tone="muted" selectable>
        Only the current saved note, your question and bounded recent conversation are sent to the
        selected provider through your Notes Again backend. The provider may charge and retain data.
        Keys never enter notes, logs, synced settings or database backups. Each response is capped
        at 1,200 output tokens; there are no automatic retries.
      </AppText>
    </KeyboardAwareScrollView>
  );
}
