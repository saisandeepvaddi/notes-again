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

// The only response that carries the plaintext token; it is never shown again.
export const CreatedApiTokenSchema = ApiTokenSchema.extend({ token: z.string() });
export type CreatedApiToken = z.infer<typeof CreatedApiTokenSchema>;

export const EXPIRY_OPTIONS = [
  { value: "365", label: "1 year" },
  { value: "90", label: "90 days" },
  { value: "30", label: "30 days" },
  { value: "never", label: "No expiry" },
];
