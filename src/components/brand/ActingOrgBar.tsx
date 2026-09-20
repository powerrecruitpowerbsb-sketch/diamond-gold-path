import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { exitOrganization } from "@/lib/impersonation.functions";

/**
 * Shown to Curve Recruit staff while they are inside a customer organization.
 * Everything they do is still recorded against their own staff account.
 */
export function ActingOrgBar({ name }: { name: string | null }) {
  const exitFn = useServerFn(exitOrganization);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await exitFn({ data: undefined as never });
      await router.navigate({ to: "/admin/organizations" });
      void queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not leave the organization");
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="border-b border-graphite/20 bg-graphite px-4 py-2 text-white sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-[13px]">
        <span className="font-mono uppercase tracking-wide text-white/60">Acting as owner</span>
        <span className="font-medium">{name ?? "Organization"}</span>
        <span className="text-white/60">
          Your actions are recorded against your Curve Recruit staff account.
        </span>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="ml-auto rounded border border-white/40 px-2 py-1 font-medium hover:bg-white/10 disabled:opacity-60"
        >
          {leaving ? "Leaving…" : "Exit organization"}
        </button>
      </div>
    </div>
  );
}
