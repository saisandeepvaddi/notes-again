import { type ConnectLink, parseConnectLink } from "@web/settings/api-tokens/connectLink";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { connectionFromLink } from "@/api/connect";
import { useConnection } from "@/api/connection";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { InlineError } from "@/components/screen-state";
import { useTheme } from "@/hooks/use-theme";
import { radius, space } from "@/theme";

const FRAME = 240;

function CloseButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close scanner"
      onPress={() => router.back()}
      hitSlop={8}
      style={({ pressed }) => ({
        position: "absolute",
        top: insets.top + 8,
        left: 12,
        width: 44,
        height: 44,
        borderRadius: radius.full,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon ios="xmark" android="close" color="#ffffff" />
    </Pressable>
  );
}

function Panel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        gap: 12,
        padding: space.gutter,
        paddingBottom: Math.max(insets.bottom, 16) + 8,
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        borderCurve: "continuous",
      }}
    >
      {children}
    </View>
  );
}

function PermissionPrompt({
  canAsk,
  onAsk,
  purpose,
}: {
  canAsk: boolean;
  onAsk: () => void;
  purpose?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Icon ios="camera" android="photo_camera" size={36} color={colors.primary} />
        <AppText variant="title">Allow the camera</AppText>
        <AppText tone="muted">
          {purpose ??
            "Notes Again uses the camera only to read the sign-in QR code shown in the web app under Settings → API tokens."}
        </AppText>
        {canAsk ? (
          <Button onPress={onAsk}>Allow camera</Button>
        ) : (
          <Button onPress={() => void Linking.openSettings()}>Open Settings</Button>
        )}
      </View>
      <CloseButton />
    </View>
  );
}

interface ScanScreenProps {
  onLink?: (link: ConnectLink) => Promise<void>;
  purpose?: string;
}

export function ScanScreen({ onLink, purpose }: ScanScreenProps = {}) {
  const { colors } = useTheme();
  const { connect } = useConnection();
  const [permission, requestPermission] = useCameraPermissions();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "#000000" }} />;
  }
  if (!permission.granted) {
    return (
      <PermissionPrompt
        canAsk={permission.canAskAgain}
        onAsk={() => void requestPermission()}
        purpose={purpose}
      />
    );
  }

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;
    const link = parseConnectLink(data);
    if (!link) {
      setError("That QR code isn’t a Notes Again sign-in code.");
      return;
    }
    setChecking(true);
    try {
      if (onLink) {
        await onLink(link);
      } else {
        await connect(await connectionFromLink(link));
      }
      if (process.env.EXPO_OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn’t connect with that code.");
      setChecking(false);
    }
  };

  const retry = () => {
    setError(null);
    handled.current = false;
  };

  const paused = checking || error !== null;

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <CameraView
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={paused ? undefined : (result) => void onScanned(result)}
      />
      <View
        pointerEvents="none"
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 140 }}
      >
        <View
          style={{
            width: FRAME,
            height: FRAME,
            borderRadius: radius.xl,
            borderCurve: "continuous",
            borderWidth: 3,
            borderColor: paused ? colors.primary : "rgba(255, 255, 255, 0.9)",
            boxShadow: "0 0 0 2000px rgba(0, 0, 0, 0.35)",
          }}
        />
      </View>
      <CloseButton />
      <Panel>
        {checking ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
            <ActivityIndicator color={colors.primary} />
            <AppText>Checking the code with your server…</AppText>
          </View>
        ) : error ? (
          <>
            <InlineError message={error} />
            <Button onPress={retry}>Scan again</Button>
          </>
        ) : (
          <>
            <AppText variant="heading">
              {onLink ? "Scan the sync code" : "Scan the sign-in code"}
            </AppText>
            <AppText tone="muted">
              {onLink
                ? "On your computer, open Notes Again: Settings → Phone & extension → Pair a phone in the desktop app, or Settings → API tokens on a server. Then point the camera at the QR code."
                : "In the web app, open Settings → API tokens, create a token with Full access, and point the camera at the QR code."}
            </AppText>
          </>
        )}
      </Panel>
    </View>
  );
}
