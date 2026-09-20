import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { RotateCw, ShieldOff, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { listBlockedSites, probeBlockedSite, probeBlockedSiteBatch } from "@/lib/operations.functions";

const when = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";

/**
 * The sites whose own firewall turns us away. Each row can be tried again on its
 * own, or the whole list can be tried a handful at a time.
 */
export function BlockedSitesQueue() {
  const listFn = useServerFn(listBlockedSites);
  const probeFn = useServerFn(probeBlockedSite);
  const batchFn = useServerFn(probeBlockedSiteBatch);

  const { data, isPending, refetch } = useQuery({
    queryKey: ["blocked-sites"],
    queryFn: () => listFn(),
  });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);

  const rows = (data ?? []) as any[];

  async function tryOne(host: string) {
    setBusy(host);
    try {
      const result = (await probeFn({ data: { host } })) as any;
      if (result.clear) toast.success(`${host} answered normally — released.`);
      else toast.info(`${host} is still blocking us (${result.detail}).`);
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not try that site");
    } finally {
      setBusy(null);
    }
  }

  async function tryBatch() {
    setBatching(true);
    try {
      const result = (await batchFn({ data: { limit: 25 } })) as any;
      toast.success(
        `Tried ${result.probed} site${result.probed === 1 ? "" : "s"} — ${result.lifted.length} released, ${result.stillBlocked.length} still blocked.`,
      );
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not run the retry");
    } finally {
      setBatching(false);
    }
  }

  return (
    <section className="rounded border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-graphite">Blocked sites</h2>
          <p className="mt-1 text-sm text-steel">
            Their firewall refuses automated reads. We set them aside rather than hammer them, and
            ask again politely. Nothing stored about these teams is changed or removed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void tryBatch()}
          disabled={batching || !rows.length}
          className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
        >
          <RotateCw className={`size-4 ${batching ? "animate-spin" : ""}`} aria-hidden />
          {batching ? "Trying 25 sites…" : "Try the 25 waiting longest"}
        </button>
      </div>

      {isPending ? (
        <div className="m-5 h-40 animate-pulse rounded border border-border bg-muted" />
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-steel">No site is blocking us right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.host} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-graphite">
                    <ShieldOff className="size-4 shrink-0 text-steel" aria-hidden />
                    <span className="truncate">{row.host}</span>
                  </p>
                  <p className="meta mt-1">
                    {row.label} · {row.programCount.toLocaleString("en-US")} team
                    {row.programCount === 1 ? "" : "s"} at {row.schoolCount.toLocaleString("en-US")} school
                    {row.schoolCount === 1 ? "" : "s"} · last tried {when(row.lastProbeAt)}
                    {row.probeStatus ? ` (${row.probeStatus})` : ""}
                  </p>
                  {row.evidence ? <p className="meta mt-0.5 text-steel">{row.evidence}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  {row.schools.length ? (
                    <button
                      type="button"
                      onClick={() => setOpen(open === row.host ? null : row.host)}
                      aria-expanded={open === row.host}
                      className="touch-target inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-graphite"
                    >
                      <ChevronDown
                        className={`size-4 transition-transform ${open === row.host ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                      Teams
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void tryOne(row.host)}
                    disabled={busy === row.host}
                    className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-graphite disabled:opacity-60"
                  >
                    <RotateCw className={`size-4 ${busy === row.host ? "animate-spin" : ""}`} aria-hidden />
                    {busy === row.host ? "Trying…" : "Try again"}
                  </button>
                </div>
              </div>

              {open === row.host ? (
                <ul className="mt-3 grid gap-1 rounded-lg border border-border bg-muted/40 p-3">
                  {row.schools.map((school: any) => (
                    <li key={school.programId} className="text-sm">
                      <Link
                        to="/admin/programs/$id"
                        params={{ id: school.programId }}
                        className="font-semibold text-org-primary underline"
                      >
                        {school.school}
                      </Link>
                      <span className="meta"> · {school.sport}</span>
                    </li>
                  ))}
                  {row.programCount > row.schools.length ? (
                    <li className="meta">
                      and {(row.programCount - row.schools.length).toLocaleString("en-US")} more
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
