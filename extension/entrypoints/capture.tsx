import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { normalizeSelection } from "../lib/capture/draft";
import { extractPageInfo } from "../lib/capture/extract";
import { isOpenDialogMessage, type CaptureContext, type OpenDialogMessage } from "../lib/capture/types";
import { CaptureDialog } from "../lib/ui/CaptureDialog";
import styles from "../lib/ui/styles.css?inline";
import { cleanUrl } from "../lib/url";

/**
 * Injected on demand by the background script (activeTab), never registered
 * as a standing content script. Mounts the capture dialog in a shadow root so
 * neither the page's CSS nor its key handlers can touch it.
 */

let mounted: { host: HTMLElement; root: Root } | null = null;

function closeDialog() {
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = null;
}

/** Constructable stylesheets aren't subject to the page's CSP `style-src`; a <style> tag can be. */
function applyStyles(shadow: ShadowRoot) {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement("style");
    style.textContent = styles;
    shadow.append(style);
  }
}

function buildContext(message: OpenDialogMessage): CaptureContext {
  const info = extractPageInfo(document);
  // The page's own selection keeps paragraph breaks; the context-menu text is the fallback for inputs and iframes.
  const selection = normalizeSelection(window.getSelection()?.toString() || message.selectionText || "");
  return {
    // Asked to save a selection but there isn't one (shortcut with nothing selected): save the page instead.
    mode: message.mode === "selection" && selection ? "selection" : "page",
    url: cleanUrl(location.href),
    title: info.title || message.tabTitle || "",
    excerpt: info.excerpt,
    selection,
  };
}

function openDialog(message: OpenDialogMessage) {
  closeDialog();
  const ctx = buildContext(message);

  const host = document.createElement("note-and-learn-capture");
  host.style.cssText = "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;";
  // Sites bind single-key shortcuts on document; typing in the dialog must not trigger them.
  for (const type of ["keydown", "keyup", "keypress"]) {
    host.addEventListener(type, (e) => e.stopPropagation());
  }

  const shadow = host.attachShadow({ mode: "open" });
  applyStyles(shadow);
  const container = document.createElement("div");
  shadow.append(container);
  document.documentElement.append(host);

  const root = createRoot(container);
  root.render(<CaptureDialog ctx={ctx} variant="overlay" onClose={closeDialog} />);
  mounted = { host, root };
}

export default defineUnlistedScript(() => {
  // executeScript re-runs this file on every capture; register the listener once per page.
  const marker = window as typeof window & { __noteAndLearnCapture?: boolean };
  if (marker.__noteAndLearnCapture) {
    return;
  }
  marker.__noteAndLearnCapture = true;

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isOpenDialogMessage(message)) {
      return false;
    }
    openDialog(message);
    sendResponse({ ok: true });
    return false;
  });
});
