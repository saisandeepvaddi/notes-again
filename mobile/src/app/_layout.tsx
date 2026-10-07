import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { Literata_400Regular, Literata_600SemiBold } from "@expo-google-fonts/literata";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ApiError } from "@/api/client";
import { ConnectionProvider, useConnection } from "@/api/connection";
import { ReadingFontProvider, useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";

void SplashScreen.preventAutoHideAsync();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

function RootNavigator() {
  const { ready, connection } = useConnection();
  const { scheme, colors } = useTheme();
  const readingFont = useReadingFont();
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    Literata_400Regular,
    Literata_600SemiBold,
  });
  const loaded = ready && readingFont.ready && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);

  if (!loaded) return null;

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected guard={connection !== null}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={connection === null}>
          <Stack.Screen name="connect" />
          <Stack.Screen name="scan" options={{ presentation: "fullScreenModal" }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <ReadingFontProvider>
            <RootNavigator />
          </ReadingFontProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}
