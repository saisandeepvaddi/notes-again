import { browser } from "wxt/browser";
import { deserializeError, type Lookups, type NoteDraft, type SerializedError } from "./api/types";

export type BackgroundRequest =
  | { type: "lookups" }
  | { type: "save"; draft: NoteDraft }
  | { type: "open-options" };

export interface LookupsResult extends Lookups {
  lastProject: string;
}

export interface SaveResult {
  id: number;
  name: string;
  openUrl: string;
}

export type BackgroundResponse<T> = { ok: true; data: T } | { ok: false; error: SerializedError };

export async function callBackground<T>(request: BackgroundRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as BackgroundResponse<T> | undefined;
  if (!response) {
    throw deserializeError({ kind: "http", message: "The extension background didn't respond. Try again." });
  }
  if (!response.ok) {
    throw deserializeError(response.error);
  }
  return response.data;
}
