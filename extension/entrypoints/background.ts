import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createCaptureApi } from "../lib/api";
import { CaptureError, serializeError } from "../lib/api/types";
import type { OpenDialogMessage, PendingWindowContext } from "../lib/capture/types";
import { captureKey, previousCapture, rememberCapture } from "../lib/capture/history";
import {
  type BackgroundRequest,
  type BackgroundResponse,
  type LookupsResult,
  type SaveResult,
} from "../lib/messaging";
import { loadSettings, saveSettings } from "../lib/settings";
import { cleanUrl, hostPermissionPattern, noteUrl, normalizeBaseUrl } from "../lib/url";

const MENU_PAGE = "nl-save-page";
const MENU_SELECTION = "nl-save-selection";

async function getApi() {
  const settings = await loadSettings();
  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(settings.serverUrl);
  } catch {
    throw new CaptureError("config", "Set the server URL in the extension options.");
  }
  if (!(await browser.permissions.contains({ origins: [hostPermissionPattern(baseUrl)] }))) {
    throw new CaptureError(
      "config",
      `The extension doesn't have access to ${baseUrl} yet. Open the options and save the server URL to grant it.`,
    );
  }
  return { api: createCaptureApi({ baseUrl, token: settings.apiToken.trim() }), settings, baseUrl };
}

async function handle(request: BackgroundRequest): Promise<unknown> {
  switch (request.type) {
    case "previous-capture": {
      const settings = await loadSettings();
      return previousCapture(
        await captureKey(
          normalizeBaseUrl(settings.serverUrl),
          settings.apiToken.trim(),
          request.sourceUrl,
        ),
      );
    }
    case "lookups": {
      const { api, settings } = await getApi();
      const lookups = await api.lookups();
      return {
        ...lookups,
        lastProject: settings.lastProject,
        lastNoteOnly: settings.lastNoteOnly,
      } satisfies LookupsResult;
    }
    case "save": {
      const { api, settings, baseUrl } = await getApi();
      const saved = await api.saveNote(request.draft);
      await Promise.allSettled([
        saveSettings({
          lastProject: request.draft.project ?? "",
          lastNoteOnly: request.draft.noteOnly ?? false,
        }),
        captureKey(baseUrl, settings.apiToken.trim(), request.draft.sourceUrl).then(
          rememberCapture,
        ),
      ]);
      return {
        ...saved,
        openUrl: noteUrl(settings.appUrl, baseUrl, saved.id),
      } satisfies SaveResult;
    }
    case "open-options":
      await browser.runtime.openOptionsPage();
      return null;
  }
}

async function openFallbackWindow(context: PendingWindowContext) {
  const id = crypto.randomUUID();
  await browser.storage.session.set({ [`pending:${id}`]: context });
  await browser.windows.create({
    url: browser.runtime.getURL(`/capture-window.html?id=${id}`),
    type: "popup",
    width: 480,
    height: 720,
  });
}

async function openCapture(
  tab: Browser.tabs.Tab | undefined,
  mode: "page" | "selection",
  selectionText?: string,
) {
  if (!tab) {
    [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  }
  if (tab?.id !== undefined) {
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ["/capture.js"] });
      await browser.tabs.sendMessage(tab.id, {
        type: "open-dialog",
        mode,
        selectionText,
        tabTitle: tab.title,
      } satisfies OpenDialogMessage);
      return;
    } catch (err) {
      console.debug("[notes-again] in-page dialog unavailable, using a window instead:", err);
    }
  }
  await openFallbackWindow({
    mode: mode === "selection" && selectionText ? "selection" : "page",
    url: cleanUrl(tab?.url ?? ""),
    title: tab?.title ?? "",
    selection: selectionText,
  });
}

function createMenus() {
  void browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: MENU_SELECTION,
      title: "Save selection to Notes Again",
      contexts: ["selection"],
    });
    browser.contextMenus.create({
      id: MENU_PAGE,
      title: "Save this page to Notes Again",
      contexts: ["page"],
    });
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(createMenus);

  browser.action.onClicked.addListener((tab) => void openCapture(tab, "page"));

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const mode = info.menuItemId === MENU_SELECTION ? "selection" : "page";
    void openCapture(tab, mode, info.selectionText);
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "save-page") {
      void openCapture(tab, "page");
    } else if (command === "save-selection") {
      void openCapture(tab, "selection");
    }
  });

  browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
    handle(message).then(
      (data) => sendResponse({ ok: true, data } satisfies BackgroundResponse<unknown>),
      (err: unknown) =>
        sendResponse({ ok: false, error: serializeError(err) } satisfies BackgroundResponse<never>),
    );
    return true;
  });
});
