export type Difficulty = "easy" | "medium" | "hard";

/** What the capture dialog produces. Project and tags are names; the API layer resolves/creates them. */
export interface NoteDraft {
  name: string;
  content: string;
  project: string | null;
  tags: string[];
  difficulty?: Difficulty;
  /** Not sent anywhere yet: reserved for source-URL dedupe if the backend grows it. */
  sourceUrl: string;
}

export interface Lookups {
  projects: string[];
  tags: string[];
}

export interface SavedNote {
  id: number;
  name: string;
}

/**
 * The seam between the extension and the backend. Today it is implemented
 * over the existing /projects, /tags and /notes routes (existingRoutes.ts);
 * when a purpose-built import endpoint exists, only lib/api/index.ts needs to
 * point at a new implementation.
 */
export interface CaptureApi {
  lookups(): Promise<Lookups>;
  saveNote(draft: NoteDraft): Promise<SavedNote>;
}

export type ErrorKind = "auth" | "config" | "network" | "http";

export class CaptureError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CaptureError";
  }
}

/** Structured-clone-safe form, for crossing the runtime.sendMessage boundary. */
export interface SerializedError {
  kind: ErrorKind;
  message: string;
  status?: number;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof CaptureError) {
    return { kind: err.kind, message: err.message, status: err.status };
  }
  return { kind: "http", message: err instanceof Error ? err.message : String(err) };
}

export function deserializeError(err: SerializedError): CaptureError {
  return new CaptureError(err.kind, err.message, err.status);
}
