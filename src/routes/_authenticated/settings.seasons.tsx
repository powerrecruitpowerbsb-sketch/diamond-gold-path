import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings/seasons")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/team", search: { tab: "teams" } });
  },
});
