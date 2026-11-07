import { parseConnectLink, type ConnectLink } from "@web/settings/api-tokens/connectLink";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { normalizeServerUrl } from "@/api/client";
import {
  connectionFromLink,
  probeServer,
  signInForToken,
  verifyAccess,
  type AuthStatus,
} from "@/api/connect";
import { useConnection } from "@/api/connection";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Icon } from "@/components/icon";
import { InlineError } from "@/components/screen-state";
import { TextField } from "@/components/text-field";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

type Method = "password" | "token" | "open";

const methodFor = (status: AuthStatus): Method =>
  status.mode === "none" ? "open" : status.mode === "local" ? "password" : "token";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

function linkFromParams(params: { server?: string; token?: string; alt?: string }): ConnectLink | null {
  if (!params.server || !params.token) return null;
  const alt = params.alt ? `&alt=${encodeURIComponent(params.alt)}` : "";
  return parseConnectLink(
    `notesagain://connect?server=${encodeURIComponent(params.server)}&token=${encodeURIComponent(params.token)}${alt}`,
  );
}

function ScanButton() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onPress={() => router.push("/scan")}
      icon={
        <Icon
          ios="qrcode.viewfinder"
          android="qr_code_scanner"
          size={18}
          color={colors.foreground}
        />
      }
    >
      Scan QR code
    </Button>
  );
}

export function ConnectScreen() {
  const { colors } = useTheme();
  const { connect, notice } = useConnection();
  const params = useLocalSearchParams<{ server?: string; token?: string; alt?: string }>();
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  const incomingLink = linkFromParams(params);
  const pendingLink = incomingLink?.token === dismissedToken ? null : incomingLink;
  const [address, setAddress] = useState("");
  const [server, setServer] = useState<{ url: string; status: AuthStatus } | null>(null);
  const [method, setMethod] = useState<Method>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const findServer = () =>
    run(async () => {
      const url = normalizeServerUrl(address);
      const status = await probeServer(url);
      setServer({ url, status });
      setMethod(methodFor(status));
    });

  const signIn = () =>
    run(async () => {
      if (!server) return;
      if (method === "password") {
        const issued = await signInForToken(server.url, username.trim(), password);
        await connect({ serverUrl: server.url, token: issued, method, username: username.trim() });
      } else if (method === "token") {
        const pasted = token.trim();
        await verifyAccess(server.url, pasted);
        await connect({ serverUrl: server.url, token: pasted, method, username: null });
      } else {
        await verifyAccess(server.url, null);
        await connect({ serverUrl: server.url, token: null, method, username: null });
      }
    });

  const connectWithLink = (link: ConnectLink) =>
    run(async () => {
      await connect(await connectionFromLink(link));
    });

  const canSubmit =
    method === "password"
      ? username.trim().length > 0 && password.length > 0
      : method === "token"
        ? token.trim().startsWith("nal_")
        : true;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={{
        padding: space.gutter,
        paddingTop: 64,
        paddingBottom: 48,
        gap: 24,
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 6 }}>
        <AppText variant="display">Notes Again</AppText>
        <AppText tone="muted">
          Connect to your server to review and capture notes on the go.
        </AppText>
      </View>

      {notice ? <InlineError message={notice} /> : null}

      {pendingLink ? (
        <Card>
          <AppText variant="heading">Connect with this code?</AppText>
          <AppText tone="muted">
            The link you opened signs this phone in to{" "}
            <AppText style={{ color: colors.foreground }}>
              {pendingLink.server.replace(/^https?:\/\//, "")}
            </AppText>
            . Only continue if you made it in your own Notes Again.
          </AppText>
          {error ? <InlineError message={error} /> : null}
          <Button onPress={() => connectWithLink(pendingLink)} loading={busy}>
            Connect
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setDismissedToken(pendingLink.token);
              setError(null);
            }}
          >
            Not now
          </Button>
        </Card>
      ) : server === null ? (
        <Card>
          <TextField
            label="Server address"
            placeholder="notes.example.com"
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            onSubmitEditing={() => address.trim() && findServer()}
            hint="The address you open Notes Again at in a browser. Add http:// for a server on your local network."
          />
          {error ? <InlineError message={error} /> : null}
          <Button onPress={findServer} loading={busy} disabled={!address.trim()}>
            Continue
          </Button>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <AppText variant="caption" tone="muted">
              or
            </AppText>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
          <ScanButton />
          <AppText variant="caption" tone="muted" style={{ textAlign: "center" }}>
            Create a Full access token in the web app’s Settings → API tokens to get a code.
          </AppText>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="label" tone="muted">
                Server
              </AppText>
              <AppText selectable numberOfLines={1}>
                {server.url.replace(/^https?:\/\//, "")}
              </AppText>
            </View>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setServer(null);
                setError(null);
              }}
            >
              Change
            </Button>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border }} />

          {method === "password" ? (
            <>
              <TextField
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <TextField
                ref={passwordRef}
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && signIn()}
              />
            </>
          ) : method === "token" ? (
            <>
              <TextField
                label="API token"
                placeholder="nal_…"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                mono
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && signIn()}
                hint="On the web app, open Settings → API tokens and create a token with Full access."
              />
              <ScanButton />
            </>
          ) : (
            <AppText tone="muted">
              Sign-in is turned off on this server, so anyone who can reach it can use it.
            </AppText>
          )}

          {error ? <InlineError message={error} /> : null}
          <Button onPress={signIn} loading={busy} disabled={!canSubmit}>
            {method === "open" ? "Connect" : "Sign in"}
          </Button>
          {server.status.mode === "local" ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                setMethod(method === "token" ? "password" : "token");
                setError(null);
              }}
            >
              {method === "token" ? "Sign in with a password instead" : "Use an API token instead"}
            </Button>
          ) : null}
        </Card>
      )}
    </ScrollView>
  );
}
