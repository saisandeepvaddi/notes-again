import { z } from "zod";

export const ApiTokenSchema = z.object({
  id: z.number(),
  name: z.string(),
  prefix: z.string(),
  scope: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});
export type ApiToken = z.infer<typeof ApiTokenSchema>;

export const CreatedApiTokenSchema = ApiTokenSchema.extend({ token: z.string() });
export type CreatedApiToken = z.infer<typeof CreatedApiTokenSchema>;

export const EXPIRY_OPTIONS = [
  { value: "365", label: "1 year" },
  { value: "90", label: "90 days" },
  { value: "30", label: "30 days" },
  { value: "never", label: "No expiry" },
];

export type TokenScope = "capture" | "app";

export const SCOPE_OPTIONS: {
  value: TokenScope;
  label: string;
  defaultName: string;
  description: string;
}[] = [
  {
    value: "capture",
    label: "Capture only",
    defaultName: "Browser extension",
    description: "Can save notes, projects and tags. It can't read, edit or delete anything.",
  },
  {
    value: "app",
    label: "Full access",
    defaultName: "Mobile app",
    description:
      "Can read, review, edit and delete notes, like signing in. It can't manage tokens or backups.",
  },
];
