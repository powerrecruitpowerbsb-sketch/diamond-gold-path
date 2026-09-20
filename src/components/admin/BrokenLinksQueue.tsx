import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Save, Download } from "lucide-react";
import { toast } from "sonner";

import { listBrokenLinks, fixProgramLink } from "@/lib/operations.functions";
import { runProgramIngest } from "@/lib/ingest.functions";

const fieldLabel = (field: string) =>
  field === "roster_url"
    ? "Roster page"
    : field === "coaching_staff_url"
      ? "Coaching staff page"
      : field === "athletic_website"
        ? "Athletics site"
        : field;

/**
 * Addresses that no longer open. Paste the right one, we check it opens before
 * saving, then read the school straight away.
 */
export function BrokenLinksQueue() {
  const listFn = useServerFn(listBrokenLinks);
  const fixFn = useServerFn(fixProgramLink);
  const readFn = useServerFn(runProgramIngest);

  const { data, isPending, refetch } = useQuery({
    queryKey: ["broken-links"],
    queryFn: () => listFn(),
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const rows = (data ?? []) as any[];

  async function save(row: any) {
    const url = (drafts[row.id] ?? "").trim();
    if (!url) {
      toast.error("Paste the correct address first.");
      return;
    }
    setBusy(row.id);
    try {
      const result = (await fixFn({ data: { programId: row.programId, field: row.field, url } })) as any;
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDrafts((current) => ({ ...current, [row.id]: "" }));
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not save that address");
    } finally {
      setBusy(null);
    }
  }

  async function readNow(row: any) {
    setBusy(`read-${row.id}`);
    try {
      await readFn({ data: { programId: row.programId } });
      toast.success(`Read ${row.school} — anything new is in the review queue.`);
      await refetch();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Could not read that school");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded border border-border bg-card">
      <div className="border-b border-border p-5">
        <h2 className="font-display text-lg font-bold text-graphite">Broken addresses</h2>
        <p className="mt-1 text-sm text-steel">
          These pages no longer open. Paste the right address and we check it opens before saving —
          then read the school on the spot.
        </p>
      </div>

      {isPending ? (
        <div className="m-5 h-40 animate-pulse rounded border border-border bg-muted" />
      ) : rows.length === 0 ? (
        <p className="p-5 text-sm text-steel">Every address on file opens.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-graphite">
                  <Link
                    to="/admin/programs/$id"
                    params={{ id: row.programId }}
                    className="text-org-primary underline"
                  >
                    {row.school}
                  </Link>
                  <span className="meta"> · {row.sport} · {fieldLabel(row.field)}</span>
                </p>
                <p className="meta">
                  {row.failures.toLocaleString("en-US")} failed tr{row.failures === 1 ? "y" : "ies"}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>

              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-sm text-steel underline"
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  {row.url}
                </a>
              ) : (
                <p className="meta">No address on file.</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://… the correct page"
                  value={drafts[row.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                  }
                  aria-label={`Correct ${fieldLabel(row.field)} for ${row.school}`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-graphite"
                />
                <button
                  type="button"
                  onClick={() => void save(row)}
                  disabled={busy === row.id}
                  className="touch-target inline-flex items-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
                >
                  <Save className="size-4" aria-hidden />
                  {busy === row.id ? "Checking…" : "Check & save"}
                </button>
                <button
                  type="button"
                  onClick={() => void readNow(row)}
                  disabled={busy === `read-${row.id}`}
                  className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-graphite disabled:opacity-60"
                >
                  <Download className="size-4" aria-hidden />
                  {busy === `read-${row.id}` ? "Reading…" : "Read this school now"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
