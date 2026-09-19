import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye } from "lucide-react";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { getFamilyPortal } from "@/lib/invites.functions";
import { SHORTLIST_STATUSES, SHORTLIST_STATUS_LABEL } from "@/lib/shortlist.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/family")({
  head: () => ({
    meta: [
      { title: "Family portal — Power Recruit" },
      {
        name: "description",
        content:
          "Follow your athlete's college list, recruiting status and the notes your coaches share with you.",
      },
      { property: "og:title", content: "Family portal — Power Recruit" },
      {
        property: "og:description",
        content: "Your athlete's college list, recruiting status and shared coach notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamilyPortal,
});

const STATUS_STYLE: Record<string, string> = {
  researching: "bg-org-primary/10 text-org-primary border-org-primary/25",
  contacted: "bg-org-accent/15 text-navy-deep border-org-accent/40",
  offered: "bg-seam-red-tint text-seam-red border-seam-red/30",
  committed: "bg-diamond-green-tint text-diamond-green border-diamond-green/30",
  eliminated: "bg-muted text-steel border-border",
};

function FamilyPortal() {
  const portalFn = useServerFn(getFamilyPortal);
  const { data, isPending, error } = useQuery({
    queryKey: ["family-portal"],
    queryFn: () => portalFn(),
    retry: false,
  });

  if (error) {
    return (
      <AppShell right={<AuthButton />}>
        <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
          {(error as Error).message}
        </p>
      </AppShell>
    );
  }

  const athletes = (data?.athletes ?? []) as Record<string, any>[];

  return (
    <AppShell right={<AuthButton />}>
      <h1 className="font-display text-3xl font-bold text-graphite">Family portal</h1>
      <p className="mt-1 max-w-2xl text-sm text-steel">
        Your athlete's college list, with the recruiting activity on each school. You and your
        coaches keep the same picture up to date.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/search"
          className="touch-target inline-flex items-center rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
        >
          Find and add a school
        </Link>
        <Link
          to="/list"
          className="touch-target inline-flex items-center rounded-xl border border-border px-4 text-sm font-semibold text-graphite hover:border-org-primary"
        >
          Update recruiting activity
        </Link>
      </div>

      {isPending ? (
        <p className="mt-6 text-sm text-steel">Loading…</p>
      ) : athletes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-white p-8 text-center shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]">
          <p className="font-display text-lg font-bold text-graphite">No athlete linked yet</p>
          <p className="mt-1 text-sm text-steel">
            Ask your organization's staff to send you a family invite — that's what connects this
            account to your athlete.
          </p>
          <Link
            to="/search"
            className="touch-target mt-4 inline-flex items-center rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
          >
            Browse the college database
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {athletes.map((athlete) => {
            const saved = (athlete['savedSchools'] ?? []) as Record<string, any>[];
            const notes = (athlete['notes'] ?? []) as Record<string, any>[];
            return (
              <section
                key={athlete['id']}
                className="rounded-xl border border-border bg-white p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]"
              >
                <h2 className="font-display text-2xl font-bold text-graphite">{athlete['name']}</h2>
                <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-4">
                  {[
                    ["Grad year", athlete['grad_year'] ?? "—"],
                    ["Position", athlete['primary_position'] ?? "—"],
                    ["Bats", athlete['bats'] ?? "—"],
                    ["Throws", athlete['throws'] ?? "—"],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="font-mono text-[11px] tracking-wide text-steel uppercase">
                        {label}
                      </dt>
                      <dd className="mt-1 font-semibold text-graphite tabular-nums">
                        {String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>

                <h3 className="mt-6 font-mono text-[11px] tracking-wide text-steel uppercase">
                  College list · {saved.length}
                </h3>
                {saved.length === 0 ? (
                  <p className="mt-2 text-sm text-steel">No schools on the list yet.</p>
                ) : (
                  <div className="mt-2 space-y-4">
                    {SHORTLIST_STATUSES.filter((status) =>
                      saved.some((row) => row['status'] === status),
                    ).map((status) => (
                      <div key={status}>
                        <span
                          className={cn(
                            "inline-block rounded-md border px-2 py-1 text-[11px] font-bold uppercase",
                            STATUS_STYLE[status],
                          )}
                        >
                          {SHORTLIST_STATUS_LABEL[status]}
                        </span>
                        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {saved
                            .filter((row) => row['status'] === status)
                            .map((row) => {
                              const program = row['program'] ?? {};
                              const university = program?.universities ?? {};
                              return (
                                <li
                                  key={row['id']}
                                  className="rounded-xl border border-border bg-chalk/60 p-3"
                                >
                                  <Link
                                    to="/programs/$id"
                                    params={{ id: String(row['program_id']) }}
                                    className="font-display text-sm font-bold text-org-primary hover:underline"
                                  >
                                    {university?.name ?? "School"}
                                  </Link>
                                  <p className="mt-1 font-mono text-[11px] text-steel">
                                    {[program?.governing_body, program?.division, university?.state]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </p>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <h3 className="mt-6 flex items-center gap-2 font-mono text-[11px] tracking-wide text-steel uppercase">
                  <Eye className="size-3.5" aria-hidden /> Notes shared with you
                </h3>
                {notes.length === 0 ? (
                  <p className="mt-2 text-sm text-steel">Nothing shared yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border/70">
                    {notes.map((note) => (
                      <li key={note['id']} className="py-3">
                        <p className="font-mono text-[11px] text-steel">
                          {new Date(note['created_at']).toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-graphite">{note['note']}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
