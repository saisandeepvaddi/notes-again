import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// A throwaway DB per run: e2e specs create/mutate real data, so they need a
// database of their own rather than the developer's actual note collection
// (and rather than getting overwritten by a previous run's leftovers).
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "note-and-learn-e2e-"));
const dbPath = path.join(dbDir, "test.db");

const BACKEND_PORT = 8210;
const FRONTEND_PORT = 5290;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // The suite shares one database across spec files (no per-worker DB, no
  // per-test reset endpoint), so tests run one at a time and use uniquely
  // named notes/projects/tags to avoid stepping on each other. Fine at this
  // suite's size; worth revisiting (a wipe endpoint, one DB per worker) if
  // the suite grows enough for serial execution to matter.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `../backend/.venv/bin/uvicorn --app-dir ../backend main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      url: `${BACKEND_URL}/healthz`,
      reuseExistingServer: false,
      stdout: "pipe",
      env: {
        AUTH_DISABLED: "1",
        DB_PATH: dbPath,
        // The frontend and backend run on different ports here (unlike
        // production, where the SPA is served same-origin) -- without this,
        // every request is silently blocked by CORS. NewNoteForm and several
        // other callers don't catch the mutation, so that failure is mute:
        // no toast, no navigation, no console error -- just a stuck page.
        CORS_ORIGINS: FRONTEND_URL,
        // No ALLOWED_EMAILS, no FIREBASE_CREDENTIALS_FILE: local-dev auth
        // bypass, same as `AUTH_DISABLED=1` in the README.
      },
    },
    {
      // firebaseEnabled (src/lib/firebase.ts) is true only when all three
      // VITE_FIREBASE_* vars are set, which flips AuthGate to the real
      // Firebase login screen instead of bypassing it. Playwright's
      // webServer.env is merged on top of the *inherited* shell environment,
      // not a clean slate -- so a dev shell that exports the repo's real
      // Firebase config (e.g. via direnv loading the root .env, or a venv
      // activation script that sources it) leaks it into this process even
      // though frontend/.env itself has no Firebase keys. Blank them
      // explicitly so this suite never depends on the invoking shell being
      // "clean".
      command: `pnpm exec vite dev --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      stdout: "pipe",
      env: {
        VITE_SERVER_IP: "127.0.0.1",
        VITE_SERVER_PORT: String(BACKEND_PORT),
        VITE_FIREBASE_API_KEY: "",
        VITE_FIREBASE_AUTH_DOMAIN: "",
        VITE_FIREBASE_PROJECT_ID: "",
      },
    },
  ],
});
