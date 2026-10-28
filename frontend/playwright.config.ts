import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-again-e2e-"));
const dbPath = path.join(dbDir, "test.db");

const BACKEND_PORT = 8210;
const FRONTEND_PORT = 5290;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `../backend/.venv/bin/uvicorn --app-dir ../backend main:app --host 127.0.0.1 --port ${BACKEND_PORT} --log-level warning`,
      url: `${BACKEND_URL}/healthz`,
      reuseExistingServer: false,
      stdout: "pipe",
      env: {
        AUTH_DISABLED: "1",
        DB_PATH: dbPath,
        CORS_ORIGINS: FRONTEND_URL,
      },
    },
    {
      command: `pnpm exec vite dev --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      stdout: "pipe",
      env: {
        VITE_SERVER_IP: "127.0.0.1",
        VITE_SERVER_PORT: String(BACKEND_PORT),
      },
    },
  ],
});
