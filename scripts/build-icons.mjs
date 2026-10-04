import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "frontend", "package.json"));
const { chromium } = require("@playwright/test");

const read = (name) =>
  readFileSync(join(root, "assets", name), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");

const appIcon = read("app-icon.svg");
const smallIcon = read("favicon.svg");
const glyph = appIcon.match(/<g[\s\S]*<\/g>/)[0];
const background = appIcon.match(/<rect[^>]*fill="([^"]+)"/)[1];

const svg = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

const variants = {
  rounded: appIcon,
  square: appIcon.replace(/\srx="[^"]*"/, ""),
  padded: appIcon.replace('viewBox="0 0 96 96"', 'viewBox="-16 -16 128 128"'),
  small: smallIcon,
  foreground: svg("-24 -24 144 144", glyph),
  monochrome: svg("-24 -24 144 144", glyph.replace(/stroke="#[0-9a-f]+"/gi, 'stroke="#ffffff"')),
};

const outputs = [
  ["mobile/assets/images/icon.png", "square", 1024],
  ["mobile/assets/images/android-icon-foreground.png", "foreground", 1024],
  ["mobile/assets/images/android-icon-monochrome.png", "monochrome", 1024],
  ["mobile/assets/images/splash-icon.png", "rounded", 512],
  ["mobile/assets/images/favicon.png", "rounded", 48],
  ["frontend/public/apple-touch-icon.png", "square", 180],
  ["frontend/public/icon-192.png", "rounded", 192],
  ["frontend/public/icon-512.png", "rounded", 512],
  ["frontend/public/icon-maskable-512.png", "square", 512],
  ["extension/public/icon/16.png", "small", 16],
  ["extension/public/icon/32.png", "small", 32],
  ["extension/public/icon/48.png", "rounded", 48],
  ["extension/public/icon/96.png", "rounded", 96],
  ["extension/public/icon/128.png", "padded", 128],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [target, variant, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  const source = `data:image/svg+xml;base64,${Buffer.from(variants[variant]).toString("base64")}`;
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${source}" width="${size}" height="${size}">`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  mkdirSync(dirname(join(root, target)), { recursive: true });
  await page.screenshot({ path: join(root, target), omitBackground: variant !== "square" });
  console.log(`${target} (${variant}, ${size}px)`);
}
await browser.close();

writeFileSync(join(root, "frontend/public/favicon.svg"), `${smallIcon.trim()}\n`);
copyFileSync(join(root, "assets/favicon.ico"), join(root, "frontend/public/favicon.ico"));
writeFileSync(
  join(root, "frontend/public/manifest.webmanifest"),
  `${JSON.stringify(
    {
      name: "Notes Again",
      short_name: "Notes Again",
      start_url: "/",
      display: "standalone",
      background_color: "#fbfaf7",
      theme_color: background,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )}\n`,
);
console.log("frontend/public/favicon.svg, favicon.ico, manifest.webmanifest");
