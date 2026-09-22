/** What the capture dialog is opened with. */
export interface CaptureContext {
  mode: "page" | "selection";
  url: string;
  title: string;
  /** Page mode only; empty when the page has nothing usable. */
  excerpt?: string;
  /** Selection mode only. */
  selection?: string;
}

/** Background -> injected script: open the in-page dialog. */
export interface OpenDialogMessage {
  type: "open-dialog";
  mode: "page" | "selection";
  /** The context-menu's selection text, used when the page's own selection can't be read (inputs, iframes). */
  selectionText?: string;
  tabTitle?: string;
}

/** What gets stashed for the fallback window (restricted pages that can't host the in-page dialog). */
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
