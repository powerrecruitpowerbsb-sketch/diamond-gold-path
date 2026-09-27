import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import {
  findTeamsForRecrawl,
  getAutopilot,
  recrawlProgram,
  runAutopilotNow,
  setAutopilot,
} from "@/lib/collection.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not yet";

/** The hands-off schedule, plus the buttons to run it (or one team) right now. */
export function AutopilotPanel() {
  const getFn = useServerFn(getAutopilot);
  const runFn = useServerFn(runAutopilotNow);
  const setFn = useServerFn(setAutopilot);
  const { data, refetch } = useQuery({ queryKey: ["autopilot"], queryFn: () => getFn(), refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const on = Boolean(data?.state?.autopilot_on);

  async function runNow() {
    setBusy(true);
    try {
      const result = await runFn();
      toast.success(result?.note ?? "Checked — nothing was due");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run the check");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(value: boolean) {
    setBusy(true);
    try {
      await setFn({ data: { on: value } });
      toast.success(value ? "Autopilot is on" : "Autopilot is paused");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-graphite">Autopilot</h2>
          <p className="text-sm text-steel">
            Every morning it sends any team whose roster is due (every 6 months) and any school whose
            tuition and test scores are due (yearly) for a fresh read. New data goes live on its own.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-graphite">
          <Switch checked={on} disabled={busy || !data} onCheckedChange={toggle} />
          {on ? "On" : "Paused"}
        </label>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Rosters due now" value={n(data?.rostersDueNow)} />
        <Stat label="Rosters due in 30 days" value={n(data?.rostersDueSoon)} />
        <Stat label="School facts due now" value={n(data?.factsDueNow)} />
        <Stat label="Teams waiting in line" value={n(data?.rosterWaiting)} />
      </dl>

      <p className="meta mt-3">
        Last autopilot check: {when(data?.state?.autopilot_last_run)}
        {data?.state?.autopilot_last_note ? ` · ${data.state.autopilot_last_note}` : ""}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={runNow} disabled={busy}>
          <RefreshCw className="size-4" aria-hidden /> Run the check now
        </Button>
      </div>

      <TeamRecrawl />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-3">
      <dt className="text-xs text-steel">{label}</dt>
      <dd className="tabular font-display text-xl font-bold text-graphite">{value}</dd>
    </div>
  );
}

function TeamRecrawl() {
  const findFn = useServerFn(findTeamsForRecrawl);
  const recrawlFn = useServerFn(recrawlProgram);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { data: teams, isFetching } = useQuery({
    queryKey: ["recrawl-find", term],
    queryFn: () => findFn({ data: { q: term } }),
    enabled: term.length >= 2,
  });

  async function go(id: string, label: string) {
    setBusyId(id);
    try {
      await recrawlFn({ data: { programId: id } });
      toast.success(`${label} is next in line — usually done within a few minutes`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not queue that team");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm font-semibold text-graphite">Refresh one team now</h3>
      <p className="text-xs text-steel">For a new coach or a freshly posted roster.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="School name, e.g. Clemson" />
        <Button type="submit" variant="outline">
          <Search className="size-4" aria-hidden /> Find
        </Button>
      </form>
      {term.length >= 2 ? (
        <ul className="mt-2 divide-y divide-border rounded border border-border">
          {isFetching ? <li className="p-3 text-sm text-steel">Searching…</li> : null}
          {!isFetching && !teams?.length ? <li className="p-3 text-sm text-steel">No teams found.</li> : null}
          {(teams ?? []).map((t) => {
            const label = `${t.school} ${t.sport}`;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 p-3">
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-graphite">{t.school}</span>{" "}
                  <span className="capitalize text-steel">{t.sport}</span>
                  <span className="meta block">Next scheduled: {when(t.nextRefresh)}</span>
                </span>
                <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => go(t.id, label)}>
                  Refresh
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
