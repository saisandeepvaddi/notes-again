export type Difficulty = "easy" | "medium" | "hard";

export interface UploadedMedia {
  uid: string;
  name: string;
  blob: Blob;
}

export interface NoteDraft {
  name: string;
  content: string;
  project: string | null;
  tags: string[];
  difficulty?: Difficulty;
  noteOnly?: boolean;
  sourceUrl: string;
  media?: import("../capture/media").MediaItem[];
}

export interface Lookups {
  projects: string[];
  tags: string[];
}

export interface SavedNote {
  id: number;
  name: string;
}

export interface CaptureApi {
  lookups(): Promise<Lookups>;
  saveNote(draft: NoteDraft): Promise<SavedNote>;
  attach(noteId: number, media: UploadedMedia): Promise<boolean>;
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
