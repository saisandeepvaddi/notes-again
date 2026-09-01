import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig(({ mode }) => {
  // staged: {
  //   "*.{js,ts,tsx,vue,svelte}": "vp check --fix",
  // },
  return {
    base: mode === "development" ? "/" : "/static",
    // fmt: {},
    // lint: {
    //   jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    //   rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    //   options: { typeAware: true, typeCheck: true },
    // },
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  };
});

export default config;
