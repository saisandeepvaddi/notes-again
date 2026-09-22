import { defineConfig } from "vitest/config";

// Deliberately not going through WXT: everything under test is browser-API
// free (fetch and storage are injected), so plain vitest is enough.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
