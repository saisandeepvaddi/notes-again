import { z } from "zod";

export const SETTINGS_SECTIONS = [
  "appearance",
  "notes",
  "review",
  "discuss",
  "sign-in",
  "sync",
  "devices",
  "tokens",
  "system",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const settingsSearchSchema = z.object({
  section: z.enum(SETTINGS_SECTIONS).optional().catch(undefined),
});
