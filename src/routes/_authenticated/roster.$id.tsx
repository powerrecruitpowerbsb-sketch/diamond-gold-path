import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { addAthleteNote, deleteAthleteNote, getOrgAthlete } from "@/lib/athletes.functions";

export const Route = createFileRoute("/_authenticated/roster/$id")({
  head: () => ({
    meta: [
      { title: "Athlete detail — Power Recruit" },
      { name: "description", content: "Athlete profile, saved schools, and staff notes." },
      { property: "og:title", content: "Athlete detail — Power Recruit" },
      {
        property: "og:description",
        content: "Athlete profile, saved schools, and staff notes in Power Recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AthleteDetail,
});

const STATUS_LABEL: Record<string, string> = {
  researching: "Researching",
  contacted: "Contacted",
  offered: "Offered",
  committed: "Committed",
  eliminated: "Eliminated",
};

function AthleteDetail() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getOrgAthlete);
  const addNoteFn = useServerFn(addAthleteNote);
  const deleteNoteFn = useServerFn(deleteAthleteNote);
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["org-athlete", id],
    queryFn: () => getFn({ data: { id } }),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["org-athlete", id] });

  async function submitNote(event: React.FormEvent) {
    event.preventDefault();
    try {
      await addNoteFn({ data: { athleteId: id, note, visibleToParent } });
      setNote("");
      setVisibleToParent(false);
      await invalidate();
      toast.success("Note added");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (error) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(error as Error).message}
        </p>
      </AppShell>
    );
  }

  const athlete = data?.athlete;

  return (
    <AppShell right={<AuthButton />}>
      <Link to="/roster" className="inline-flex items-center gap-2 text-sm font-medium text-steel hover:text-org-primary">
        <ArrowLeft className="size-4" aria-hidden /> Roster
      </Link>

      {isPending || !athlete ? (
        <p className="mt-6 text-sm text-steel">Loading athlete…</p>
      ) : (
        <>
          <div className="mt-4 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <p className="font-mono text-[11px] tracking-wide text-steel uppercase">
              {String(athlete['athlete_data_source']).replace("_", " ")} entry
            </p>
            <h1 className="font-display text-3xl font-bold text-graphite">{athlete['name']}</h1>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
              {[
                ["Grad year", athlete['grad_year'] ?? "—"],
                ["Position", athlete['primary_position'] ?? "—"],
                ["Bats", athlete['bats'] ?? "—"],
                ["Throws", athlete['throws'] ?? "—"],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="font-mono text-[11px] tracking-wide text-steel uppercase">{label}</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-graphite">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>

          <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <h2 className="font-display text-xl font-bold text-graphite">Saved schools</h2>
            {(data?.savedSchools ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-steel">
                No saved schools yet — school lists are built out in the next phase.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border/70">
                {(data?.savedSchools ?? []).map((row: any) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span className="font-semibold text-graphite">
                      {row.program?.universities?.name ?? "Unknown school"}
                    </span>
                    <span className="text-steel">
                      {row.program?.sport} · {row.program?.governing_body} {row.program?.division}
                    </span>
                    <span className="ml-auto rounded-md bg-chalk px-2 py-1 font-mono text-[11px] text-steel">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
            <h2 className="font-display text-xl font-bold text-graphite">Staff notes</h2>
            <form onSubmit={submitNote} className="mt-3">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Development focus, showcase observations…"
                className="w-full rounded-lg border border-border bg-white p-3 text-sm text-graphite outline-none focus:border-org-primary"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-steel">
                  <input
                    type="checkbox"
                    checked={visibleToParent}
                    onChange={(event) => setVisibleToParent(event.target.checked)}
                  />
                  Visible to parent (once family accounts exist)
                </label>
                <button
                  type="submit"
                  className="touch-target ml-auto inline-flex items-center rounded-xl bg-org-primary px-4 text-sm font-semibold text-white"
                >
                  Add note
                </button>
              </div>
            </form>

            <ul className="mt-4 divide-y divide-border/70">
              {(data?.notes ?? []).map((row: any) => (
                <li key={row.id} className="flex items-start gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-mono text-[11px] text-steel">
                      {new Date(row.created_at).toLocaleString()}
                      {row.visible_to_parent ? " · shared with parent" : " · internal"}
                    </p>
                    <p className="mt-1 text-sm text-graphite">{row.note}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={async () => {
                      try {
                        await deleteNoteFn({ data: { id: row.id } });
                        await invalidate();
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                    className="touch-target grid place-items-center rounded-lg border border-border px-2 text-steel hover:text-seam-red"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
