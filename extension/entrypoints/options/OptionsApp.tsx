import { useEffect, useRef, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import { createCaptureApi } from "../../lib/api";
import { buildConnectLink, parseConnectLink } from "../../lib/connectLink";
import { DEFAULT_SETTINGS, DESKTOP_APP_URL, loadSettings, saveSettings } from "../../lib/settings";
import { hostPermissionPattern, normalizeBaseUrl } from "../../lib/url";

interface Status {
  text: string;
  error?: boolean;
}

const LOCAL_DEV_APP_URLS = ["http://localhost:5173", "http://localhost:5273"];
const TOKEN_PREFIX = "nal_";

function isLocalHost(input: string): boolean {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(normalizeBaseUrl(input)).hostname);
  } catch {
    return false;
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function OptionsApp() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SETTINGS.serverUrl);
  const [appUrl, setAppUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [connectionMode, setConnectionMode] = useState<"desktop" | "server">("server");
  const [desktopLink, setDesktopLink] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);
  const desktopLinkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setServerUrl(settings.serverUrl);
      setAppUrl(settings.appUrl);
      setApiToken(settings.apiToken);
      const desktop =
        settings.connectionMode === "desktop" ||
        (!settings.connectionMode && settings.serverUrl === DESKTOP_APP_URL);
      setConnectionMode(desktop ? "desktop" : "server");
      if (desktop && settings.apiToken)
        setDesktopLink(buildConnectLink({ server: settings.serverUrl, token: settings.apiToken }));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded && connectionMode === "desktop") desktopLinkRef.current?.focus();
  }, [loaded, connectionMode]);

  const useDesktopApp = () => {
    setConnectionMode("desktop");
    setStatus(null);
    desktopLinkRef.current?.focus();
  };

  const acceptLink = (value: string) => {
    const link = parseConnectLink(value);
    if (link || value.trim().startsWith("notesagain:")) {
      setDesktopLink(value.trim());
      setConnectionMode("desktop");
      setStatus(null);
      return true;
    }
    return false;
  };

  const readForm = async () => {
    const pastedLink =
      connectionMode === "desktop"
        ? desktopLink.trim()
        : [serverUrl, apiToken].find((value) => value.trim().startsWith("notesagain:"))?.trim();
    const link = pastedLink ? parseConnectLink(pastedLink) : null;
    if ((connectionMode === "desktop" || pastedLink) && !link) {
      throw new Error(
        "Paste the full connection link from Notes Again → Settings → Phone & extension → Create a link for the extension.",
      );
    }
    let base: string;
    try {
      base = normalizeBaseUrl(link?.server ?? serverUrl);
    } catch (error) {
      if (link)
        throw new Error(
          "The connection link has an unsupported server address. Create a new link in the desktop app.",
        );
      throw error;
    }
    const token = link?.token ?? apiToken.trim();
    if (token && !token.startsWith(TOKEN_PREFIX)) {
      throw new Error(
        `That doesn't look like a Notes Again token: they start with ${TOKEN_PREFIX}.`,
      );
    }
    const granted = await browser.permissions.request({ origins: [hostPermissionPattern(base)] });
    if (!granted) {
      throw new Error(
        `Access to ${base} was not granted, so the extension can't reach your server.`,
      );
    }
    return { base, token, mode: link ? ("desktop" as const) : ("server" as const) };
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      const { base, token, mode } = await readForm();
      const app = mode === "desktop" ? "" : appUrl.trim() ? normalizeBaseUrl(appUrl) : "";
      await saveSettings({ serverUrl: base, appUrl: app, apiToken: token, connectionMode: mode });
      setServerUrl(base);
      setAppUrl(app);
      setApiToken(token);
      setStatus({
        text:
          mode === "desktop" ? "Saved. Keep Notes Again running when capturing pages." : "Saved.",
      });
    } catch (err) {
      setStatus({ text: messageOf(err), error: true });
    }
  };

  const test = async () => {
    setStatus({ text: "Testing…" });
    try {
      const { base, token } = await readForm();
      const result = await createCaptureApi({ baseUrl: base, token }).lookups();
      setStatus({
        text: `Connected: ${result.projects.length} project(s), ${result.tags.length} tag(s). Save to keep these settings.`,
      });
    } catch (err) {
      setStatus({ text: messageOf(err), error: true });
    }
  };

  if (!loaded) {
    return null;
  }

  let desktopAddress: string | null = null;
  try {
    const parsed = parseConnectLink(desktopLink);
    if (parsed) desktopAddress = normalizeBaseUrl(parsed.server);
  } catch {}

  return (
    <div className="nl-root nl-options">
      <h1>Notes Again Capture</h1>
      <p className="nl-help">Save pages and selections straight into your notes.</p>

      <section>
        <h2>Connection</h2>
        <div className="nl-connection-modes" role="group" aria-label="Connection type">
          <button
            type="button"
            className={connectionMode === "desktop" ? "nl-button nl-primary" : "nl-button"}
            aria-pressed={connectionMode === "desktop"}
            onClick={useDesktopApp}
          >
            Use the desktop app
          </button>
          <button
            type="button"
            className={connectionMode === "server" ? "nl-button nl-primary" : "nl-button"}
            aria-pressed={connectionMode === "server"}
            onClick={() => {
              setConnectionMode("server");
              setStatus(null);
            }}
          >
            Use a self-hosted server
          </button>
        </div>
        <form onSubmit={save}>
          {connectionMode === "desktop" ? (
            <div className="nl-field">
              <label className="nl-label" htmlFor="desktop-link">
                Desktop connection link
              </label>
              <input
                id="desktop-link"
                ref={desktopLinkRef}
                type="password"
                className="nl-input"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="notesagain://connect?…"
                value={desktopLink}
                onChange={(e) => {
                  setDesktopLink(e.target.value);
                  setStatus(null);
                }}
                aria-describedby="desktop-link-help"
              />
              <p id="desktop-link-help" className="nl-help">
                In Notes Again, open Settings → Phone &amp; extension → Create a link for the
                extension. Paste the entire link here, then Save. It includes both the app address
                and your capture token.
              </p>
              {desktopAddress && (
                <p className="nl-help">
                  App address: <code>{desktopAddress}</code>
                </p>
              )}
              <p className="nl-help">
                Keep the app running to capture pages. Treat this link like a password; revoke it in
                the app’s API tokens settings.
              </p>
            </div>
          ) : (
            <>
              <div className="nl-field">
                <label className="nl-label" htmlFor="server-url">
                  Server URL
                </label>
                <input
                  id="server-url"
                  className="nl-input"
                  value={serverUrl}
                  onChange={(e) => {
                    if (!acceptLink(e.target.value)) setServerUrl(e.target.value);
                  }}
                />
                <p className="nl-help">
                  Where the API runs, e.g. http://localhost:8000 or https://notes.example.com.
                  Anything other than your own machine or private network must be https.
                </p>
              </div>

              <div className="nl-field">
                <label className="nl-label" htmlFor="api-token">
                  API token
                </label>
                <input
                  id="api-token"
                  type="password"
                  className="nl-input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={`${TOKEN_PREFIX}…`}
                  value={apiToken}
                  onChange={(e) => {
                    if (!acceptLink(e.target.value)) setApiToken(e.target.value);
                  }}
                />
                <p className="nl-help">
                  In the web app, open Settings &gt; API tokens &gt; Create token, then paste it
                  here. A connect link (notesagain://connect?…) also works and fills in the server
                  too. The token can only save notes, and you can revoke it there any time. Leave
                  empty if the server runs with AUTH_DISABLED=1 (local dev).
                </p>
              </div>
            </>
          )}

          {connectionMode === "server" && (
            <div className="nl-field">
              <label className="nl-label" htmlFor="app-url">
                App URL (optional)
              </label>
              <input
                id="app-url"
                className="nl-input"
                value={appUrl}
                placeholder="Same as server URL"
                onChange={(e) => setAppUrl(e.target.value)}
              />
              <p className="nl-help">
                Where "Open in Notes Again" goes. Leave empty in production, where the API serves
                the web app from the same address. It's only needed when the web app lives
                elsewhere, as in local dev.
              </p>
              {!appUrl.trim() && isLocalHost(serverUrl) && (
                <p className="nl-help">
                  Running locally? The web app is usually on its own port. Use{" "}
                  {LOCAL_DEV_APP_URLS.map((url, i) => (
                    <span key={url}>
                      {i > 0 && " or "}
                      <button type="button" className="nl-link" onClick={() => setAppUrl(url)}>
                        {url}
                      </button>
                    </span>
                  ))}
                  , then Save.
                </p>
              )}
            </div>
          )}

          <div className="nl-actions" style={{ justifyContent: "flex-start" }}>
            <button type="submit" className="nl-button nl-primary">
              Save
            </button>
            <button type="button" className="nl-button" onClick={() => void test()}>
              Test connection
            </button>
          </div>
          {status && (
            <p
              className={status.error ? "nl-status is-error" : "nl-status"}
              role={status.error ? "alert" : "status"}
            >
              {status.text}
            </p>
          )}
        </form>
      </section>

      <section>
        <h2>Shortcuts</h2>
        <p className="nl-help">
          Save page: Alt+Shift+N. Save selection: Alt+Shift+S. You can also right-click a page or a
          selection, or click the toolbar button. Rebind shortcuts at chrome://extensions/shortcuts
          (Chrome) or about:addons (Firefox: gear menu, Manage Extension Shortcuts).
        </p>
      </section>
    </div>
  );
}
