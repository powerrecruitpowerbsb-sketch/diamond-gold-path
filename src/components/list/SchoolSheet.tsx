import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Send } from "lucide-react";
import { toast } from "sonner";

import { ActivityChips } from "@/components/list/ActivityChips";
import { RosterComposition, type RosterRow } from "@/components/profile/Composition";
import { RosterTable } from "@/components/profile/RosterTable";
import { IntelligencePanel } from "@/components/profile/DataLayers";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getProgramProfile } from "@/lib/search.functions";
import {
  getThread,
  markThreadRead,
  openThread,
  reportThread,
  sendMessage,
} from "@/lib/messaging.functions";
import { setEntryNotes } from "@/lib/continuum.functions";

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
        className="w-full overflow-y-auto border-l border-border p-0 sm:max-w-none sm:w-3/4"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-xl text-graphite">
            {entry?.school ?? ""}
          </SheetTitle>
          <p className="meta text-steel">
            {[
              entry?.sport,
              program['governing_body'],
              program['division'],
              program['conference'],
              university['state'],
            ]
              .filter(Boolean)
              .join(" · ") || "Loading…"}
          </p>
          {entry ? (
            <Link
              to="/programs/$id"
              params={{ id: entry.programId }}
              className="text-sm font-semibold text-org-primary underline"
            >
              Go to full profile
            </Link>
          ) : null}
        </SheetHeader>

        {entry ? (
          <Tabs defaultValue={defaultTab ?? "overview"} className="px-5 py-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="email">Email coach</TabsTrigger>
              <TabsTrigger value="roster">Roster</TabsTrigger>
              <TabsTrigger value="intel">Intelligence</TabsTrigger>
              <TabsTrigger value="notes">Notes &amp; Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="pt-4">
              <ActivityChips entryId={entry.id} />
            </TabsContent>

            <TabsContent value="email" className="pt-4">
              <OutreachComposer
                programId={entry.programId}
                school={entry.school}
                athleteId={entry.athleteId ?? athleteId}
                entryId={entry.id}
                headCoachName={program['head_coach_name'] ?? null}
              />
            </TabsContent>

            <TabsContent value="overview" className="pt-4">
              {profile.isPending ? (
                <p className="text-sm text-steel">Loading…</p>
              ) : (
                <dl className="grid gap-4 sm:grid-cols-3">
                  {[
                    ["Location", [university['city'], university['state']].filter(Boolean).join(", ")],
                    [
                      "Enrollment",
                      university['undergrad_enrollment']
                        ? Number(university['undergrad_enrollment']).toLocaleString("en-US")
                        : null,
                    ],
                    [
                      "Net price",
                      university['est_net_price']
                        ? `$${Number(university['est_net_price']).toLocaleString("en-US")}`
                        : null,
                    ],
                    ["Acceptance rate", university['acceptance_rate']],
                    ["Head coach", program['head_coach_name']],
                    ["Roster size", roster.length || null],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt className="meta text-steel">{String(label)}</dt>
                      <dd className="mt-1 font-semibold text-graphite tabular-nums">
                        {value === null || value === undefined || value === ""
                          ? "Not reported"
                          : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </TabsContent>

            <TabsContent value="roster" className="pt-4">
              {roster.length === 0 ? (
                <p className="text-sm text-steel">Not published by the school.</p>
              ) : (
                <>
                  <RosterComposition rows={roster} season={profile.data?.latestSeason ?? null} />
                  <div className="mt-4">
                    <RosterTable rows={roster} />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="intel" className="pt-4">
              <IntelligencePanel rows={intel} />
              <Link
                to="/intelligence"
                search={{ programId: entry.programId }}
                className="mt-3 inline-flex rounded-full border border-dashed border-border px-2.5 py-1 text-[12px] font-semibold text-steel hover:border-org-primary hover:text-graphite"
              >
                Edit in workstation
              </Link>
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
  const openFn = useServerFn(openThread);
  const threadFn = useServerFn(getThread);
  const sendFn = useServerFn(sendMessage);
  const readFn = useServerFn(markThreadRead);
  const reportFn = useServerFn(reportThread);
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState(entry.notes ?? "");
  const [threadId, setThreadId] = useState<string | null>(entry.threadId);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setNotes(entry.notes ?? "");
    setThreadId(entry.threadId);
  }, [entry.id, entry.notes, entry.threadId]);

  const thread = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => threadFn({ data: { threadId: threadId! } }),
    enabled: Boolean(threadId),
    retry: false,
  });

  useEffect(() => {
    if (threadId) readFn({ data: { threadId } }).catch(() => undefined);
  }, [threadId, thread.data?.messages.length, readFn]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [thread.data?.messages.length]);

  // Opening the tab also tops up the participant list, so a parent added to the
  // athlete after the thread started still joins the conversation.
  useEffect(() => {
    if (threadId && athleteId) {
      openFn({ data: { athleteId, programId: entry.programId } }).catch((error: Error) =>
        console.error("thread sync failed", error.message),
      );
    }
  }, [threadId, athleteId, entry.programId, openFn]);

  const start = useMutation({
    mutationFn: () => openFn({ data: { athleteId: athleteId ?? "", programId: entry.programId } }),
    onSuccess: (result) => {
      setThreadId(result.threadId);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { threadId: threadId!, body: draft } }),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flag = useMutation({
    mutationFn: (reason: string) => reportFn({ data: { threadId: threadId!, reason } }),
    onSuccess: () => toast.success("Reported. Power Recruit staff can see it."),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="meta text-steel">Notes on this school</h3>
        {entry.id ? (
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => {
              if ((entry.notes ?? "") !== notes) {
                notesFn({ data: { entryId: entry.id as string, notes: notes || null } })
                  .then(() => {
                    toast.success("Note saved");
                    onSaved();
                  })
                  .catch((error: Error) => toast.error(error.message));
              }
            }}
            rows={6}
            className="mt-2"
            placeholder="What you know about this school, and where things stand."
          />
        ) : (
          <p className="mt-2 rounded border border-border p-4 text-sm text-steel">
            Add this school to a player's list to keep notes on it.
          </p>
        )}
      </section>

      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <h3 className="meta text-steel">Conversation</h3>
          {threadId ? (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-seam-red"
              onClick={() => {
                const reason = window.prompt("What's wrong with this conversation?");
                if (reason) flag.mutate(reason);
              }}
            >
              <Flag className="size-3" /> Report
            </button>
          ) : null}
        </div>

        {!threadId ? (
          <div className="mt-2 rounded border border-border p-4">
            <p className="text-sm text-steel">
              No conversation about this school yet. A parent is always included.
            </p>
            <Button
              className="touch-target mt-3"
              disabled={!athleteId || start.isPending}
              onClick={() => start.mutate()}
            >
              Start the conversation
            </Button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-steel">
              {(thread.data?.participants ?? [])
                .map((p) => `${p.name} (${String(p.role).replace("org_", "")})`)
                .join(" · ") || "Loading…"}
            </p>
            <div className="mt-2 max-h-72 flex-1 space-y-3 overflow-y-auto rounded border border-border p-3">
              {(thread.data?.messages ?? []).length === 0 ? (
                <p className="text-sm text-steel">No messages yet.</p>
              ) : (
                (thread.data?.messages ?? []).map((message) => (
                  <div key={message.id}>
                    <p className="meta text-steel">
                      {message.authorName} ·{" "}
                      {new Date(message.createdAt as string).toLocaleString("en-US")}
                      {message.editedAt ? " · corrected" : ""}
                    </p>
                    <p className="text-sm text-graphite">{message.body}</p>
                    {message.bodyOriginal ? (
                      <p className="text-xs text-steel">
                        Originally: {String(message.bodyOriginal)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={bottom} />
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) send.mutate();
              }}
            >
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                placeholder="Write a message. Everything here is kept."
              />
              <Button type="submit" className="touch-target" disabled={send.isPending}>
                <Send className="size-4" />
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
