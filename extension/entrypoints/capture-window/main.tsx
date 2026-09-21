import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import type { CaptureContext, PendingWindowContext } from "../../lib/capture/types";
import { CaptureDialog } from "../../lib/ui/CaptureDialog";
import "../../lib/ui/styles.css";

/**
 * Fallback for pages that can't host the in-page dialog (chrome://, web
 * stores, PDF viewers). The background script hands over what it knows via
 * storage.session, keyed by the id in the query string.
 */
async function loadContext(): Promise<CaptureContext> {
  const id = new URLSearchParams(location.search).get("id");
  const key = `pending:${id}`;
  const stored = await browser.storage.session.get(key);
  const pending = stored[key] as PendingWindowContext | undefined;
  await browser.storage.session.remove(key);
  return {
    mode: pending?.mode ?? "page",
    url: pending?.url ?? "",
    title: pending?.title ?? "",
    selection: pending?.selection,
  };
}

void loadContext().then((ctx) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <CaptureDialog ctx={ctx} variant="window" onClose={() => window.close()} />
    </StrictMode>,
  );
});
