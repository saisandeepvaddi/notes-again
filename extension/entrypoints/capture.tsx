import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { normalizeSelection } from "../lib/capture/draft";
import { extractPageInfo } from "../lib/capture/extract";
import { extractArticle } from "../lib/capture/article";
import { rasterizeSvgs } from "../lib/capture/media";
import {
  isOpenDialogMessage,
  type CaptureContext,
  type OpenDialogMessage,
} from "../lib/capture/types";
import { CaptureDialog } from "../lib/ui/CaptureDialog";
import styles from "../lib/ui/styles.css?inline";
import { cleanUrl } from "../lib/url";

let mounted: { host: HTMLElement; root: Root } | null = null;

function closeDialog() {
  mounted?.root.unmount();
  mounted?.host.remove();
  mounted = null;
}

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

async function buildContext(message: OpenDialogMessage): Promise<CaptureContext> {
  const info = extractPageInfo(document);
  const selection = normalizeSelection(
    window.getSelection()?.toString() || message.selectionText || "",
  );
  return {
    mode: message.mode === "selection" && selection ? "selection" : "page",
    url: cleanUrl(location.href),
    title: info.title || message.tabTitle || "",
    excerpt: info.excerpt,
    selection,
    capturedAt: new Date().toISOString(),
    article: extractArticle(document, location.href, await rasterizeSvgs(document)),
  };
}

async function openDialog(message: OpenDialogMessage) {
  closeDialog();
  const ctx = await buildContext(message);
  closeDialog();

  const host = document.createElement("notes-again-capture");
  host.style.cssText =
    "all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;";
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
  const marker = window as typeof window & { __notesAgainCapture?: boolean };
  if (marker.__notesAgainCapture) {
    return;
  }
  marker.__notesAgainCapture = true;

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isOpenDialogMessage(message)) {
      return false;
    }
    void openDialog(message);
    sendResponse({ ok: true });
    return false;
  });
});
