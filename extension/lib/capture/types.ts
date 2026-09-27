export interface CaptureContext {
  mode: "page" | "selection";
  url: string;
  title: string;
  excerpt?: string;
  selection?: string;
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
