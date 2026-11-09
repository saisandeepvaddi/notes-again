import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "notes-again-ios-export-"));

try {
  const env = { ...process.env };
  delete env.EXPO_NO_BUNDLE_SPLITTING;
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/expo/bin/cli"),
      "export",
      "--platform",
      "ios",
      "--output-dir",
      output,
    ],
    { cwd: root, env, encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const dom = path.join(output, "www.bundle");
  const pages = readdirSync(dom).filter((name) => name.endsWith(".html"));
  assert.equal(pages.length, 2, "Both the note renderer and rich editor must be exported");
  for (const page of pages) {
    const html = readFileSync(path.join(dom, page), "utf8");
    const resources = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)];
    assert.ok(resources.length > 0, `${page} must load its exported DOM resources`);
    for (const [, reference] of resources) {
      if (/^(?:https?:|data:)/.test(reference)) continue;
      const resource = reference.startsWith("/")
        ? path.join(output, reference)
        : path.resolve(dom, reference);
      assert.ok(existsSync(resource), `${page} references missing resource ${reference}`);
    }
  }
  console.log("iOS export passed: both DOM pages reference existing bundled resources.");
} finally {
  rmSync(output, { recursive: true, force: true });
}
