import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { ActivityChips } from "@/components/list/ActivityChips";
import { OutreachComposer } from "@/components/list/OutreachComposer";
import { RosterComposition, type RosterRow } from "@/components/profile/Composition";
import { RosterTable } from "@/components/profile/RosterTable";
import { TrueFitPanel } from "@/components/profile/TrueFitPanel";
import { IntelligencePanel } from "@/components/profile/DataLayers";
import { Panel, StatCard } from "@/components/profile/ProfileUI";
import { count, money, pct } from "@/lib/profile-fields";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getProgramProfile } from "@/lib/search.functions";
import { setEntryNotes } from "@/lib/continuum.functions";
import { useMyAccount } from "@/hooks/use-my-account";
import { isOrgManagerRole } from "@/lib/roles";
import { openThread } from "@/lib/messaging.functions";

export type SheetEntry = {
  /** Null when the school is not on any list yet (opened straight from Search). */
  id: string | null;
  programId: string;
  school: string;
  sport: string | null;
  notes: string | null;
  threadId: string | null;
  /** Set when one screen shows several athletes' schools at once. */
  athleteId?: string | null;
};

/**
 * The school opens over the list, not instead of it — a family can flip
 * through several saved schools without losing their place.
 */
export function SchoolSheet({
  entry,
  athleteId,
  onClose,
  defaultTab,
}: {
  entry: SheetEntry | null;
  athleteId: string | null;
  onClose: () => void;
  /** "activity" when the family tapped straight into recruiting activity. */
  defaultTab?: string;
}) {
  const profileFn = useServerFn(getProgramProfile);
  const queryClient = useQueryClient();
  const { account } = useMyAccount();
  const myRole = (account as any)?.primaryRole as string | undefined;
  const canEditIntel = myRole === "superadmin" || isOrgManagerRole(myRole);
  const open = Boolean(entry);

  const profile = useQuery({
    queryKey: ["program-profile", entry?.programId],
    queryFn: () => profileFn({ data: { programId: entry!.programId } }),
    enabled: open,
    retry: false,
  });

  const roster = (profile.data?.roster ?? []) as RosterRow[];
  const intel = (profile.data?.intelligence ?? []) as any[];
  const university = (profile.data?.university ?? {}) as Record<string, any>;
  const program = (profile.data?.program ?? {}) as Record<string, any>;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border p-0 sm:max-w-3xl"
      >
        <SheetHeader className="stadium-gradient relative gap-0 overflow-hidden px-5 py-6 sm:px-7 sm:py-7">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--org-primary), transparent)" }}
            aria-hidden
          />
          <div className="flex items-start gap-4">
            <span className="font-display grid size-14 shrink-0 place-items-center rounded-xl bg-org-primary text-lg font-bold text-org-primary-foreground shadow-[0_8px_24px_-10px_var(--org-primary)]">
              {String(entry?.school ?? "")
                .replace(/University|College|of|the|at/gi, "")
                .split(/\s+/)
                .filter(Boolean)
                .map((w) => w[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "C"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {[program['governing_body'], program['division']].filter(Boolean).length ? (
                  <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide text-white uppercase">
                    {[program['governing_body'], program['division']].filter(Boolean).join(" ")}
                  </span>
                ) : null}
                {entry?.sport ? (
                  <span className="rounded-md border border-white/20 px-2 py-0.5 font-mono text-[10px] tracking-wide text-white/80 uppercase">
                    {entry.sport}
                  </span>
                ) : null}
              </div>
              <SheetTitle className="font-display mt-2 text-[1.6rem] leading-[1.1] font-bold text-white sm:text-3xl">
                {entry?.school ?? ""}
              </SheetTitle>
              <p className="mt-1.5 text-sm text-white/70">
                {[
                  [university['city'], university['state']].filter(Boolean).join(", "),
                  program['conference'],
                ]
                  .filter(Boolean)
                  .join(" · ") || "Loading…"}
              </p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {(
              [
                ["Net price", university['est_net_price'] ? money(university['est_net_price']) : "—"],
                ["Roster", roster.length ? String(roster.length) : "—"],
                ["Head coach", program['head_coach_name'] ? String(program['head_coach_name']) : "—"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2">
                <dt className="font-mono text-[10px] tracking-wide text-white/60 uppercase">{k}</dt>
                <dd className="tabular truncate text-sm font-bold text-white">{v}</dd>
              </div>
            ))}
          </dl>
          {entry ? (
            <div className="mt-4">
              <Link
                to="/programs/$id"
                params={{ id: entry.programId }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Full profile
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
          ) : null}
        </SheetHeader>

        {entry ? (
          <Tabs
            defaultValue={
              defaultTab === "email" ? "activity" : defaultTab === "academics" ? "overview" : (defaultTab ?? "overview")
            }
            className="px-5 py-5 sm:px-7"
          >
            <TabsList className="sticky top-0 z-20 -mx-5 flex h-auto w-[calc(100%+2.5rem)] flex-nowrap justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-background/95 px-5 py-0 backdrop-blur [scrollbar-width:none] sm:-mx-7 sm:w-[calc(100%+3.5rem)] sm:px-7 [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ["overview", "School"],
                  ["fit", "Fit"],
                  ["activity", "Track"],
                  ["roster", "Roster"],
                  ["intel", "Intel"],
                  ["notes", "Journal"],
                ] as [string, string][]
              ).map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="touch-target shrink-0 flex-none rounded-none border-0 bg-transparent px-3 py-2.5 text-sm font-semibold whitespace-nowrap text-steel shadow-none data-[state=active]:bg-transparent data-[state=active]:text-org-primary data-[state=active]:shadow-[inset_0_-2px_0_0_var(--org-primary)]"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="fit" className="pt-5">
              <TrueFitPanel
                programId={entry.programId}
                athleteId={entry.athleteId ?? athleteId}
              />
            </TabsContent>


            <TabsContent value="activity" className="space-y-3 pt-5">
              <ActivityChips entryId={entry.id} />
              <OutreachComposer
                programId={entry.programId}
                school={entry.school}
                athleteId={entry.athleteId ?? athleteId}
                entryId={entry.id}
                headCoachName={program['head_coach_name'] ?? null}
              />
            </TabsContent>

            <TabsContent value="overview" className="pt-5">
              {profile.isPending ? (
                <p className="text-sm text-steel">Loading…</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Undergrads"
                      value={
                        university['undergrad_enrollment']
                          ? count(university['undergrad_enrollment'])
                          : "Not reported"
                      }
                      verified
                    />
                    <StatCard
                      label="Net price"
                      value={
                        university['est_net_price']
                          ? money(university['est_net_price'])
                          : "Not reported"
                      }
                      hint="Average after aid"
                      verified
                    />
                    <StatCard
                      label="Acceptance"
                      value={
                        university['acceptance_rate']
                          ? pct(university['acceptance_rate'])
                          : "Not reported"
                      }
                      verified
                    />
                    <StatCard
                      label="Roster"
                      value={roster.length ? `${roster.length} players` : "Not published"}
                      hint={profile.data?.latestSeason ? String(profile.data.latestSeason) : null}
                    />
                  </div>
                  <Panel title="Program">
                    <dl className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["Level", [program['governing_body'], program['division']].filter(Boolean).join(" ")],
                          ["Conference", program['conference']],
                          ["Head coach", program['head_coach_name']],
                          [
                            "Location",
                            [university['city'], university['state']].filter(Boolean).join(", "),
                          ],
                        ] as [string, unknown][]
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                        >
                          <dt className="meta text-steel">{label}</dt>
                          <dd className="mt-0.5 truncate text-sm font-semibold text-graphite">
                            {value ? String(value) : <span className="font-normal italic text-steel/70">Not reported</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Panel>
              <SectionLabel>Academics</SectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard
                    label="SAT"
                    value={
                      university['sat_total_25'] && university['sat_total_75']
                        ? `${university['sat_total_25']}–${university['sat_total_75']}`
                        : "Not reported"
                    }
                    verified
                  />
                  <StatCard
                    label="ACT"
                    value={
                      university['act_25'] && university['act_75']
                        ? `${university['act_25']}–${university['act_75']}`
                        : "Not reported"
                    }
                    verified
                  />
                  <StatCard
                    label="Grad rate"
                    value={
                      university['graduation_rate']
                        ? pct(university['graduation_rate'])
                        : "Not reported"
                    }
                    verified
                  />
                  <StatCard
                    label="Test optional"
                    value={
                      university['test_optional'] === null ||
                      university['test_optional'] === undefined
                        ? "Not reported"
                        : university['test_optional']
                          ? "Yes"
                          : "No"
                    }
                  />
                </div>
                <SectionLabel>Cost</SectionLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatCard
                    label="In-state"
                    value={
                      university['tuition_in_state']
                        ? money(university['tuition_in_state'])
                        : "Not reported"
                    }
                    verified
                  />
                  <StatCard
                    label="Out-of-state"
                    value={
                      university['tuition_out_state']
                        ? money(university['tuition_out_state'])
                        : "Not reported"
                    }
                    verified
                  />
                  <StatCard
                    label="Full cost"
                    value={
                      university['est_cost_of_attendance']
                        ? money(university['est_cost_of_attendance'])
                        : "Not reported"
                    }
                    verified
                  />
                </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="roster" className="pt-5">
              {roster.length === 0 ? (
                <Panel title="Roster">
                  <p className="text-sm text-steel">Not published</p>
                </Panel>
              ) : (
                <div className="space-y-4">
                  <RosterComposition rows={roster} season={profile.data?.latestSeason ?? null} />
                  <Panel title="Players" meta={`${roster.length} listed`}>
                    <RosterTable rows={roster} />
                  </Panel>
                </div>
              )}
            </TabsContent>

            <TabsContent value="intel" className="pt-4">
              <IntelligencePanel rows={intel} />
              {canEditIntel ? (
                <Link
                  to="/intelligence"
                  search={{ programId: entry.programId }}
                  className="mt-3 inline-flex rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] font-semibold text-steel hover:border-org-primary hover:text-graphite"
                >
                  Edit in workstation
                </Link>
              ) : null}
            </TabsContent>


            <TabsContent value="notes" className="pt-4">
              <NotesAndMessages
                entry={entry}
                athleteId={athleteId}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ["college-list"] })}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function NotesAndMessages({
  entry,
  athleteId,
  onSaved,
}: {
  entry: SheetEntry;
  athleteId: string | null;
  onSaved: () => void;
}) {
  const notesFn = useServerFn(setEntryNotes);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [saved, setSaved] = useState(entry.notes ?? "");

  useEffect(() => {
    setNotes(entry.notes ?? "");
    setSaved(entry.notes ?? "");
  }, [entry.id, entry.notes]);

  const save = useMutation({
    mutationFn: () => notesFn({ data: { entryId: entry.id as string, notes: notes || null } }),
    onSuccess: () => {
      setSaved(notes);
      toast.success("Saved");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!entry.id) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-org-primary" aria-hidden />
        <SectionLabel>Journal</SectionLabel>
        <p className="mt-2 text-sm text-steel">Add to My Colleges to keep notes.</p>
      </div>
    );
  }

  const dirty = notes !== saved;
  return (
    <div className="space-y-4">
    <DiscussButton programId={entry.programId} athleteId={entry.athleteId ?? athleteId} />
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-org-primary" aria-hidden />
      <div className="flex items-center justify-between">
        <SectionLabel>Journal</SectionLabel>
        <span className="font-mono text-[10px] tracking-wide text-steel uppercase">
          {save.isPending ? "Saving…" : dirty ? "Unsaved" : saved ? "Saved" : "Private"}
        </span>
      </div>
      <Textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        onBlur={() => dirty && save.mutate()}
        rows={10}
        className="mt-3 min-h-56 resize-y bg-muted/30 text-[15px] leading-relaxed"
        placeholder="Visits, calls, pros, cons…"
      />
      <div className="mt-3 flex justify-end">
        <Button
          className="touch-target"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </div>
    </div>
    </div>
  );
}

function DiscussButton({ programId, athleteId }: { programId: string; athleteId: string | null }) {
  const openFn = useServerFn(openThread);
  const navigate = useNavigate();
  const go = useMutation({
    mutationFn: () => openFn({ data: { athleteId: athleteId as string, programId } }),
    onSuccess: ({ threadId }) => navigate({ to: "/messages", search: { thread: threadId } }),
    onError: (error: Error) => toast.error(error.message),
  });
  if (!athleteId) return null;
  return (
    <Button variant="outline" className="touch-target w-full justify-center gap-2" disabled={go.isPending} onClick={() => go.mutate()}>
      <MessageSquare className="size-4" /> {go.isPending ? "Opening…" : "Discuss this school"}
    </Button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 pt-3 font-display text-sm font-bold tracking-wide text-graphite uppercase">
      <span className="h-3.5 w-1 rounded-full bg-org-primary" aria-hidden />
      {children}
    </h3>
  );
}
