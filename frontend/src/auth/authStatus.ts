import { getFetcher, postFetcher, putFetcher } from "@/utils/fetchers";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";

export const AUTH_STATUS_KEY = ["auth-status"] as const;

export const FIREBASE_DOCS_URL =
  "https://github.com/saisandeepvaddi/notes-again/blob/main/docs/firebase-auth.md";

export const AuthModeSchema = z.enum([
  "local",
  "firebase",
  "none",
  "proxy",
  "cloudflare-access",
  "desktop",
]);
export type AuthMode = z.infer<typeof AuthModeSchema>;

export const AuthStatusSchema = z.object({
  mode: AuthModeSchema,
  configured_mode: AuthModeSchema,
  authenticated: z.boolean(),
  setup_required: z.boolean(),
  username: z.string().nullable().optional(),
  firebase: z
    .object({ apiKey: z.string(), authDomain: z.string(), projectId: z.string() })
    .nullable()
    .optional(),
  logout_url: z.string().nullable().optional(),
});
export type AuthStatus = z.infer<typeof AuthStatusSchema>;

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: () => getFetcher("/auth/status")().then((data) => AuthStatusSchema.parse(data)),
    staleTime: Infinity,
    retry: 1,
  });
}

export interface LocalAuthInput {
  enabled: boolean;
  username?: string;
  password?: string;
  currentPassword?: string;
}

export function useUpdateLocalAuth() {
  return useMutation({
    mutationKey: ["update-local-auth"],
    mutationFn: ({ enabled, username, password, currentPassword }: LocalAuthInput) =>
      putFetcher("/auth/local")(
        JSON.stringify({ enabled, username, password, current_password: currentPassword }),
      ),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}

export async function localSignIn(username: string, password: string) {
  await postFetcher("/auth/login")(JSON.stringify({ username, password }));
}

export async function localSignOut() {
  await postFetcher("/auth/logout")();
}
