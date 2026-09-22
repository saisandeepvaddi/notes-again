import { createFileRoute, redirect } from "@tanstack/react-router";

// All Notes is the app's actual daily-use home; there's no separate landing
// page to render here.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/notes" });
  },
});
