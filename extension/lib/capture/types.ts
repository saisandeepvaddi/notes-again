import type { MediaItem } from "./media";

export type CaptureMode = "link" | "article" | "selection";

export interface Article {
  title: string;
  markdown: string;
  author?: string;
  publishedAt?: string;
  siteName?: string;
  media: MediaItem[];
}

export type ArticleResult = { ok: true; article: Article } | { ok: false; reason: string };

export interface CaptureContext {
  mode: "page" | "selection";
  url: string;
  title: string;
  excerpt?: string;
  selection?: string;
  capturedAt?: string;
  article?: ArticleResult;
}

export interface OpenDialogMessage {
  type: "open-dialog";
  mode: "page" | "selection";
  selectionText?: string;
  tabTitle?: string;
}

export interface PendingWindowContext {
  mode: "page" | "selection";
  url: string;
  title: string;
  selection?: string;
}

export function isOpenDialogMessage(value: unknown): value is OpenDialogMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "open-dialog"
  );
}
