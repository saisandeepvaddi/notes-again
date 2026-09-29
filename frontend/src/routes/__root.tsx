import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  type NotFoundRouteProps,
} from "@tanstack/react-router";

import Layout from "@/components/layout/Layout";
import { Toaster } from "@/components/ui/toast";
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
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: (props: NotFoundRouteProps) => {
    return <>Not Found {props.routeId}</>;
  },
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Layout />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}
