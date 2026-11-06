import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-again-e2e-"));
const dbPath = path.join(dbDir, "test.db");

const BACKEND_PORT = 8210;
const FRONTEND_PORT = 5290;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const BUILT = !!process.env.E2E_BUILT;
const FRONTEND_URL = BUILT ? BACKEND_URL : `http://127.0.0.1:${FRONTEND_PORT}`;

const devFrontend = {
  command: `pnpm exec vite dev --port ${FRONTEND_PORT} --strictPort`,
  url: FRONTEND_URL,
  reuseExistingServer: false,
  stdout: "pipe" as const,
  env: {
    VITE_SERVER_IP: "127.0.0.1",
    VITE_SERVER_PORT: String(BACKEND_PORT),
  },
};

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
      command: `cargo run --quiet --manifest-path ../server/Cargo.toml -- serve --host 127.0.0.1 --port ${BACKEND_PORT}`,
      timeout: 300_000,
      url: `${BACKEND_URL}/healthz`,
      reuseExistingServer: false,
      stdout: "pipe",
      env: {
        AUTH_DISABLED: "1",
        RUST_LOG: "warn",
        BACKUP_INTERVAL_HOURS: "0",
        DB_PATH: dbPath,
        CORS_ORIGINS: FRONTEND_URL,
        ...(BUILT ? { FRONTEND_DIST: path.resolve("dist/client") } : {}),
      },
    },
    ...(BUILT ? [] : [devFrontend]),
  ],
});
