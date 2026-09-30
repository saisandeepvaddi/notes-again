import { useEffect, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import { createCaptureApi } from "../../lib/api";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../../lib/settings";
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
  const [status, setStatus] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setServerUrl(settings.serverUrl);
      setAppUrl(settings.appUrl);
      setApiToken(settings.apiToken);
      setLoaded(true);
    })();
  }, []);

  const readForm = async () => {
    const base = normalizeBaseUrl(serverUrl);
    const token = apiToken.trim();
    if (token && !token.startsWith(TOKEN_PREFIX)) {
      throw new Error(`That doesn't look like a Notes Again token: they start with ${TOKEN_PREFIX}.`);
    }
    const granted = await browser.permissions.request({ origins: [hostPermissionPattern(base)] });
    if (!granted) {
      throw new Error(`Access to ${base} was not granted, so the extension can't reach your server.`);
    }
    return { base, token };
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      const { base, token } = await readForm();
      const app = appUrl.trim() ? normalizeBaseUrl(appUrl) : "";
      await saveSettings({ serverUrl: base, appUrl: app, apiToken: token });
      setServerUrl(base);
      setAppUrl(app);
      setApiToken(token);
      setStatus({ text: "Saved." });
    } catch (err) {
      setStatus({ text: messageOf(err), error: true });
    }
  };

  const test = async () => {
    setStatus({ text: "Testing…" });
    try {
      const { base, token } = await readForm();
      const result = await createCaptureApi({ baseUrl: base, token }).lookups();
      setStatus({ text: `Connected: ${result.projects.length} project(s), ${result.tags.length} tag(s). Save to keep these settings.` });
    } catch (err) {
      setStatus({ text: messageOf(err), error: true });
    }
  };

  if (!loaded) {
    return null;
  }

  return (
    <div className="nl-root nl-options">
      <h1>Notes Again Capture</h1>
      <p className="nl-help">Save pages and selections straight into your notes.</p>

      <section>
        <h2>Connection</h2>
        <form onSubmit={save}>
          <div className="nl-field">
            <label className="nl-label" htmlFor="server-url">
              Server URL
            </label>
            <input id="server-url" className="nl-input" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
            <p className="nl-help">
              Where the API runs, e.g. http://localhost:8000 or https://notes.example.com. Anything other than your own machine or
              private network must be https.
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
              onChange={(e) => setApiToken(e.target.value)}
            />
            <p className="nl-help">
              In the web app, open Settings &gt; API tokens &gt; Create token, then paste it here. It can only save notes, and you can
              revoke it there any time. Leave empty if the server runs with AUTH_DISABLED=1 (local dev).
            </p>
          </div>

          <div className="nl-field">
            <label className="nl-label" htmlFor="app-url">
              App URL (optional)
            </label>
            <input id="app-url" className="nl-input" value={appUrl} placeholder="Same as server URL" onChange={(e) => setAppUrl(e.target.value)} />
            <p className="nl-help">
              Where "Open in Notes Again" goes. Leave empty in production, where the API serves the web app from the same address.
              It's only needed when the web app lives elsewhere, as in local dev.
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

          <div className="nl-actions" style={{ justifyContent: "flex-start" }}>
            <button type="submit" className="nl-button nl-primary">
              Save
            </button>
            <button type="button" className="nl-button" onClick={() => void test()}>
              Test connection
            </button>
          </div>
          {status && <p className={status.error ? "nl-status is-error" : "nl-status"}>{status.text}</p>}
        </form>
      </section>

      <section>
        <h2>Shortcuts</h2>
        <p className="nl-help">
          Save page: Alt+Shift+N. Save selection: Alt+Shift+S. You can also right-click a page or a selection, or click the toolbar
          button. Rebind shortcuts at chrome://extensions/shortcuts (Chrome) or about:addons (Firefox: gear menu, Manage Extension Shortcuts).
        </p>
      </section>
    </div>
  );
}
