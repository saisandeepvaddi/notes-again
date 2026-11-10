import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROVIDERS } from "./core";
import { forgetCredentials, saveCredentials } from "./credentials";
import { useCredentials } from "./webCredentials";

export function DiscussionSettings() {
  const stored = useCredentials();
  const [config, setConfig] = useState(stored.config);
  const [remember, setRemember] = useState(stored.remembered);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (stored.ready) {
      setConfig(stored.config);
      setRemember(stored.remembered);
    }
  }, [stored.ready, stored.config, stored.remembered]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveCredentials(config, remember);
      setMessage(
        remember
          ? "Saved in macOS Keychain."
          : "Ready for this app session. Reloading or quitting clears the key.",
      );
    } catch {
      setError(
        "Could not save these settings. Check the provider, model ID and key; try a session-only key if Keychain is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };
  const forget = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await forgetCredentials();
      setMessage("Key removed from this app session and secure storage.");
    } catch {
      setError("Could not remove the saved key. Try again before leaving this device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex max-w-lg flex-col gap-5" aria-labelledby="discuss-settings-title">
      <div className="flex flex-col gap-1">
        <h2 id="discuss-settings-title" className="text-sm font-medium">
          Discuss
        </h2>
        <p className="text-xs text-muted-foreground">
          Optional AI conversations about one saved note, using your own provider account.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
            <Select
              value={config.provider}
              onValueChange={(value) => {
                const provider = PROVIDERS.find((item) => item.value === value);
                if (provider)
                  setConfig({ provider: provider.value, model: provider.model, apiKey: "" });
              }}
              disabled={busy || !stored.ready}
            >
              <SelectTrigger id="ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-model">Model ID</FieldLabel>
            <Input
              id="ai-model"
              value={config.model}
              maxLength={120}
              disabled={busy || !stored.ready}
              onChange={(event) => setConfig({ ...config, model: event.target.value })}
              autoComplete="off"
            />
            <FieldDescription>
              Use a text model available to your provider account. Each response is capped at 1,200
              output tokens.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-key">Provider API key</FieldLabel>
            <Input
              id="ai-key"
              type="password"
              value={config.apiKey}
              maxLength={512}
              disabled={busy || !stored.ready}
              onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
            <FieldDescription>
              Never stored in notes, sync, browser storage, logs or database backups. Requests pass
              through your Notes Again backend to the selected provider over HTTPS.
            </FieldDescription>
          </Field>
          {stored.canRemember && (
            <Field orientation="horizontal">
              <Checkbox
                id="ai-remember"
                checked={remember}
                onCheckedChange={(checked) => setRemember(!!checked)}
                disabled={busy}
              />
              <FieldLabel htmlFor="ai-remember">Remember on this Mac using Keychain</FieldLabel>
            </Field>
          )}
          {!stored.canRemember && (
            <p className="text-xs text-muted-foreground">
              Browser keys stay in memory for this page session only. Reloading clears them.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !stored.ready}>
              Save Discuss settings
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !stored.ready}
              onClick={() => void forget()}
            >
              Forget key
            </Button>
          </div>
        </FieldGroup>
      </form>
      {(error || stored.error) && (
        <Alert variant="destructive">
          <AlertDescription>{error || stored.error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Nothing is sent until you ask a question. Only the current note, your question and bounded
        recent conversation are sent—not your library. Your provider may charge and retain data
        under its own policies. Chat is not synced or saved unless you explicitly create a note.
      </p>
    </section>
  );
}
