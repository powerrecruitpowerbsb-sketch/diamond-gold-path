import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Trophy } from "lucide-react";
import { toast } from "sonner";

import { getWallState, setWall } from "@/lib/wall.functions";

/** Public, shareable page of every committed athlete. */
export function WallShare() {
  const stateFn = useServerFn(getWallState);
  const setFn = useServerFn(setWall);
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["wall-state"], queryFn: () => stateFn(), retry: false });
  if (!data) return null;
  const url =
    data.enabled && data.token && typeof window !== "undefined"
      ? `${window.location.origin}/wall/${data.token}`
      : null;

  async function update(enabled: boolean, newLink = false) {
    try {
      await setFn({ data: { enabled, newLink } });
      await queryClient.invalidateQueries({ queryKey: ["wall-state"] });
      toast.success(enabled ? "Wall of Fame is live" : "Wall of Fame turned off");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <Trophy className="size-5 text-org-primary" aria-hidden />
      <div className="min-w-48 flex-1">
        <h2 className="font-display text-base font-bold text-graphite">Commits</h2>
        <p className="text-xs text-steel">
          {data.commits} committed athlete{data.commits === 1 ? "" : "s"}.{" "}
          {url ? "Your Wall of Fame is live." : "Share them on a public Wall of Fame with school logos."}
        </p>
      </div>
      {url ? (
        <>
          <button
            type="button"
            onClick={async () => {
              if (navigator.share) await navigator.share({ title: "Wall of Fame", url }).catch(() => {});
              else {
                await navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }
            }}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-seam-red px-4 text-sm font-semibold text-white"
          >
            <Copy className="size-4" aria-hidden /> Share
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="touch-target inline-flex items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-graphite"
          >
            <ExternalLink className="size-4" aria-hidden /> Open
          </a>
          {data.canManage ? (
            <button type="button" onClick={() => void update(false)} className="touch-target px-2 text-xs font-semibold text-steel underline">
              Turn off
            </button>
          ) : null}
        </>
      ) : data.canManage ? (
        <button
          type="button"
          onClick={() => void update(true, Boolean(data.token))}
          className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
        >
          Create link
        </button>
      ) : null}
    </section>
  );
}
