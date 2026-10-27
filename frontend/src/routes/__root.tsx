import { HeadContent, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

import Layout from "@/components/layout/Layout";
import { NotFoundPage } from "@/components/NotFoundPage";
import { RouteError } from "@/components/RouteError";
import { Toaster } from "@/components/ui/toast";
import { NOTE_LAYOUT_INIT_SCRIPT } from "@/lib/noteLayout";
import { READING_FONT_INIT_SCRIPT } from "@/lib/readingFont";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Notes Again",
      },
      {
        name: "description",
        content: "Spaced repetition for freeform markdown notes.",
      },
      {
        name: "theme-color",
        content: "#227c45",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: ({ error }) => <RouteError error={error} />,
});

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: READING_FONT_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NOTE_LAYOUT_INIT_SCRIPT }} />
      </head>
      <body>
        <Layout />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}
