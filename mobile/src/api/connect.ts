import { NotePageSchema } from "@web/notes/new-note-form/types";
import type { ConnectLink } from "@web/settings/api-tokens/connectLink";
import * as Device from "expo-device";
import { z } from "zod";
import { ApiError, api, normalizeServerUrl } from "./client";
import type { Connection } from "./connection-store";

const AuthStatusSchema = z.object({
  mode: z.enum(["local", "firebase", "none", "proxy", "cloudflare-access", "desktop"]),
  configured_mode: z.string(),
  setup_required: z.boolean().default(false),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

const CreatedTokenSchema = z.object({ token: z.string(), scope: z.string() });

export async function probeServer(serverUrl: string): Promise<AuthStatus> {
  try {
    return await api(AuthStatusSchema, "/auth/status", { serverUrl, token: null });
  } catch (error) {
    if (error instanceof ApiError && error.status !== 0 && error.status !== 200) {
      throw new ApiError(
        `The server answered with an error (${error.status}). Check the address.`,
        error.status,
      );
    }
    throw new ApiError(
      "Couldn't find Notes Again at that address. If it sits behind Cloudflare Access or a sign-in proxy, the app can't get through that yet.",
      0,
    );
  }
}

export async function signInForToken(serverUrl: string, username: string, password: string) {
  const deviceName = [Device.manufacturer, Device.modelName].filter(Boolean).join(" ");
  const created = await api(CreatedTokenSchema, "/auth/token", {
    serverUrl,
    token: null,
    method: "POST",
    body: {
      username,
      password,
      device_name: deviceName ? `Mobile app (${deviceName})` : "Mobile app",
    },
  });
  return created.token;
}

export async function verifyAccess(serverUrl: string, token: string | null) {
  try {
    await api(NotePageSchema, "/notes/due?limit=1", { serverUrl, token });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError("That token wasn't accepted. It may be revoked or expired.", 401);
    }
    if (error instanceof ApiError && error.status === 403) {
      throw new ApiError(
        "That's a capture-only token. Create a Full access token in Settings → API tokens.",
        403,
      );
    }
    throw error;
  }
}

export async function revokeOwnToken(serverUrl: string, token: string) {
  await api(z.null(), "/auth/token", { serverUrl, token, method: "DELETE" });
}

export async function connectionFromLink(link: ConnectLink): Promise<Connection> {
  const primary = normalizeServerUrl(link.server);
  const fallback = link.alt ? normalizeServerUrl(link.alt) : null;
  try {
    await verifyAccess(primary, link.token);
    return {
      serverUrl: primary,
      token: link.token,
      method: "token",
      username: null,
      fallbackUrl: fallback,
    };
  } catch (error) {
    if (!fallback || !(error instanceof ApiError) || error.status !== 0) throw error;
    await verifyAccess(fallback, link.token);
    return {
      serverUrl: fallback,
      token: link.token,
      method: "token",
      username: null,
      fallbackUrl: primary,
    };
  }
}
