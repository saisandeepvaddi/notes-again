import { useEffect, useState, type FormEvent } from "react";
import { browser } from "wxt/browser";
import { CaptureError } from "../../lib/api/types";
import { callBackground, type LookupsResult, type SignInResult } from "../../lib/messaging";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, sessionStore } from "../../lib/settings";
import { FIREBASE_ORIGINS, hostPermissionPattern, normalizeBaseUrl } from "../../lib/url";

interface Status {
  text: string;
  error?: boolean;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function OptionsApp() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SETTINGS.serverUrl);
  const [appUrl, setAppUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Status | null>(null);
  const [authStatus, setAuthStatus] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const settings = await loadSettings();
      setServerUrl(settings.serverUrl);
      setAppUrl(settings.appUrl);
      setApiKey(settings.firebaseApiKey);
      setSignedInAs((await sessionStore.get())?.email ?? null);
      setLoaded(true);
    })();
  }, []);

  const saveConnection = async (e: FormEvent) => {
    e.preventDefault();
    setConnectionStatus(null);
    try {
      const base = normalizeBaseUrl(serverUrl);
      // First await on purpose: permissions.request must run inside the click's user gesture.
      const origins = [hostPermissionPattern(base), ...(apiKey.trim() ? FIREBASE_ORIGINS : [])];
      const granted = await browser.permissions.request({ origins });
      if (!granted) {
        throw new Error(`Access to ${base} was not granted, so the extension can't reach your server.`);
      }
      const app = appUrl.trim() ? normalizeBaseUrl(appUrl) : "";
      await saveSettings({ serverUrl: base, appUrl: app, firebaseApiKey: apiKey.trim() });
      setServerUrl(base);
      setAppUrl(app);
      setConnectionStatus({ text: "Saved." });
    } catch (err) {
      setConnectionStatus({ text: messageOf(err), error: true });
    }
  };

  const testConnection = async () => {
    setConnectionStatus({ text: "Testing…" });
    try {
      const result = await callBackground<LookupsResult>({ type: "lookups" });
      setConnectionStatus({
        text: `Connected: ${result.projects.length} project(s), ${result.tags.length} tag(s).`,
      });
    } catch (err) {
      setConnectionStatus({ text: messageOf(err), error: true });
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setAuthStatus(null);
    try {
      // Sign-in reads the API key from storage, so persist what's on screen first.
      await saveSettings({ firebaseApiKey: apiKey.trim() });
      const result = await callBackground<SignInResult>({ type: "sign-in", email, password });
      setSignedInAs(result.email);
      setPassword("");
      setAuthStatus({ text: "Signed in." });
    } catch (err) {
      setAuthStatus({ text: err instanceof CaptureError ? err.message : messageOf(err), error: true });
    }
  };

  const signOut = async () => {
    await callBackground({ type: "sign-out" });
    setSignedInAs(null);
    setAuthStatus({ text: "Signed out." });
  };

  if (!loaded) {
    return null;
  }

  return (
    <div className="nl-root nl-options">
      <h1>Note and Learn Capture</h1>
      <p className="nl-help">Save pages and selections straight into your notes.</p>

      <section>
        <h2>Server</h2>
        <form onSubmit={saveConnection}>
          <div className="nl-field">
            <label className="nl-label" htmlFor="server-url">
              Server URL
            </label>
            <input id="server-url" className="nl-input" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
            <p className="nl-help">Where the API runs, e.g. http://localhost:8000 or https://notes.example.com.</p>
          </div>
          <div className="nl-field">
            <label className="nl-label" htmlFor="app-url">
              App URL (optional)
            </label>
            <input id="app-url" className="nl-input" value={appUrl} placeholder="Same as server URL" onChange={(e) => setAppUrl(e.target.value)} />
            <p className="nl-help">Only needed in local dev, where the web app (e.g. http://localhost:5273) isn't served by the API.</p>
          </div>
          <div className="nl-field">
            <label className="nl-label" htmlFor="api-key">
              Firebase web API key
            </label>
            <input id="api-key" className="nl-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} spellCheck={false} />
            <p className="nl-help">Same as VITE_FIREBASE_API_KEY in the web app. Leave empty if the server runs with AUTH_DISABLED=1.</p>
          </div>
          <div className="nl-actions" style={{ justifyContent: "flex-start" }}>
            <button type="submit" className="nl-button nl-primary">
              Save
            </button>
            <button type="button" className="nl-button" onClick={() => void testConnection()}>
              Test connection
            </button>
          </div>
          {connectionStatus && <p className={connectionStatus.error ? "nl-status is-error" : "nl-status"}>{connectionStatus.text}</p>}
        </form>
      </section>

      <section>
        <h2>Account</h2>
        {signedInAs ? (
          <div>
            <p>
              Signed in as <strong>{signedInAs}</strong>.
            </p>
            <button type="button" className="nl-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={signIn}>
            <div className="nl-field">
              <label className="nl-label" htmlFor="email">
                Email
              </label>
              <input id="email" type="email" className="nl-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="nl-field">
              <label className="nl-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="nl-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="nl-help">Used once to sign in; only the refresh token is kept, and the password is never stored.</p>
            </div>
            <button type="submit" className="nl-button nl-primary" disabled={!apiKey.trim() || !email || !password}>
              Sign in
            </button>
          </form>
        )}
        {authStatus && <p className={authStatus.error ? "nl-status is-error" : "nl-status"}>{authStatus.text}</p>}
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
