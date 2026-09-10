import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig(() => {
  return {
    resolve: { tsconfigPaths: true },
    server: { host: true },
    plugins: [
      devtools({
        consolePiping: {
          enabled: false,
        },
        enhancedLogs: {
          enabled: false,
        },
      }),
      tailwindcss(),
      tanstackStart({
        // Build a client-only SPA: a prerendered index.html shell plus client
        // assets, served by the FastAPI backend. No Node server in production.
        spa: { enabled: true, prerender: { outputPath: "/index" } },
      }),
      react({
        compiler: true,
      }),
    ],
  };
});

export default config;
