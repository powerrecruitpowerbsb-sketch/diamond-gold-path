import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Mail, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toggleActivityChip } from "@/lib/activity.functions";
import {
  deleteCoachContact,
  getCoachContacts,
  getOutreachAthlete,
  saveCoachContact,
} from "@/lib/outreach.functions";
import {
  buildEmailBody,
  COACH_ROLES,
  SUBJECT_TEMPLATES,
  mailtoLink,
  type OutreachInput,
} from "@/lib/outreach";

const dateLabel = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";

/**
 * One screen that turns everything we already know about the player into an
 * email a college coach will actually read — and logs that it went out.
 */
export function OutreachComposer({
  programId,
  school,
  athleteId,
  entryId,
  headCoachName,
}: {
  programId: string;
  school: string;
  athleteId: string | null;
  entryId: string | null;
  headCoachName?: string | null;
}) {
  const contactsFn = useServerFn(getCoachContacts);
  const athleteFn = useServerFn(getOutreachAthlete);
  const saveContactFn = useServerFn(saveCoachContact);
  const deleteContactFn = useServerFn(deleteCoachContact);
  const chipFn = useServerFn(toggleActivityChip);
  const queryClient = useQueryClient();

  const contacts = useQuery({
    queryKey: ["coach-contacts", programId],
    queryFn: () => contactsFn({ data: { programId } }),
    retry: false,
  });

  const player = useQuery({
    queryKey: ["outreach-athlete", athleteId],
    queryFn: () => athleteFn({ data: { athleteId: athleteId! } }),
    enabled: Boolean(athleteId),
    retry: false,
  });

  const [selected, setSelected] = useState<string>("");
  const [templateId, setTemplateId] = useState(SUBJECT_TEMPLATES[0]!.id);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [touched, setTouched] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    coachName: headCoachName ?? "",
    coachRole: "Recruiting Coordinator",
    email: "",
    phone: "",
    notes: "",
  });

  const list = (contacts.data?.contacts ?? []) as any[];
  const canEdit = Boolean(contacts.data?.canEdit);
  const coach = list.find((row) => row.id === selected) ?? list[0] ?? null;
  const a = (player.data?.athlete ?? null) as Record<string, any> | null;

  const input: OutreachInput = useMemo(() => {
    const facts = (player.data?.facts ?? []).slice(0, 8);
    const events = (player.data?.events ?? []).map(
      (event: any) =>
        `${event.name}${event.startDate ? ` — ${dateLabel(event.startDate)}` : ""}${
          event.place ? ` (${event.place})` : ""
        }`,
    );
    const scoutCardUrl =
      a && a['share_enabled'] && a['share_slug']
        ? `${typeof window === "undefined" ? "" : window.location.origin}/p/${a['share_slug']}`
        : "";
    const contactLine = a
      ? [a['athlete_phone'], a['athlete_email'], a['parent_name'] ? `Parent: ${a['parent_name']}${a['parent_phone'] ? ` ${a['parent_phone']}` : ""}` : null]
          .filter(Boolean)
          .join(" · ")
      : "";
    return {
      name: String(a?.['name'] ?? ""),
      gradYear: a?.['grad_year'] ? String(a['grad_year']) : "",
      position: String(a?.['primary_position'] ?? ""),
      state: String(a?.['home_state'] ?? ""),
      school,
      coachName: String(coach?.coach_name ?? headCoachName ?? ""),
      coachRole: String(coach?.coach_role ?? ""),
      highSchool: String(a?.['high_school'] ?? ""),
      clubTeam: String(a?.['club_team'] ?? ""),
      gpa: a?.['gpa'] ? String(a['gpa']) : "",
      testScore: a?.['sat_score']
        ? `SAT: ${a['sat_score']}`
        : a?.['act_score']
          ? `ACT: ${a['act_score']}`
          : "",
      facts,
      videoLinks: ((a?.['video_links'] ?? []) as string[]).slice(0, 3),
      events,
      nextEvent: events[0] ? String(events[0]).split(" — ")[0]! : "",
      scoutCardUrl,
      contactLine,
    };
  }, [a, coach, headCoachName, player.data, school]);

  const template = SUBJECT_TEMPLATES.find((item) => item.id === templateId) ?? SUBJECT_TEMPLATES[0]!;
  const draftSubject = touched && subject ? subject : template.build(input);
  const draftBody = touched && body ? body : buildEmailBody(input);

  const saveContact = useMutation({
    mutationFn: () => saveContactFn({ data: { programId, ...form } }),
    onSuccess: () => {
      setAdding(false);
      setForm({ coachName: "", coachRole: "Recruiting Coordinator", email: "", phone: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["coach-contacts", programId] });
      toast.success("Coach saved for this school");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeContact = useMutation({
    mutationFn: (id: string) => deleteContactFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach-contacts", programId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const logSent = useMutation({
    mutationFn: async () => {
      if (!entryId) return;
      await chipFn({ data: { entryId, chipId: "intro_email", on: true } });
      if (input.videoLinks.length) {
        await chipFn({ data: { entryId, chipId: "video_sent", on: true } });
      }
      if (input.events.length) {
        await chipFn({ data: { entryId, chipId: "schedule_sent", on: true } });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-activity", entryId] });
      queryClient.invalidateQueries({ queryKey: ["college-list"] });
    },
  });

  if (!athleteId) {
    return (
      <p className="rounded border border-border p-4 text-sm text-steel">
        Pick a player to write to this program's coaches.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="meta text-steel">Coaches at {school}</h3>
          {canEdit ? (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-semibold text-org-primary"
              onClick={() => setAdding((value) => !value)}
            >
              <Plus className="size-3" /> Add coach
            </button>
          ) : null}
        </div>

        {headCoachName && !list.some((row) => row.coach_name === headCoachName) ? (
          <p className="mt-2 text-xs text-steel">
            Published head coach: <span className="font-semibold text-graphite">{headCoachName}</span>{" "}
            — we don't have an email for them yet.
          </p>
        ) : null}

        {adding ? (
          <form
            className="mt-3 space-y-2 rounded border border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              saveContact.mutate();
            }}
          >
            <Input
              value={form.coachName}
              onChange={(event) => setForm({ ...form, coachName: event.target.value })}
              placeholder="Coach name"
              required
            />
            <select
              value={form.coachRole}
              onChange={(event) => setForm({ ...form, coachRole: event.target.value })}
              className="h-10 w-full rounded border border-border bg-background px-2 text-sm"
            >
              {COACH_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="coach@school.edu"
              type="email"
            />
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="Phone (optional)"
            />
            <Input
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Where this came from (optional)"
            />
            <Button type="submit" className="touch-target w-full" disabled={saveContact.isPending}>
              Save coach
            </Button>
          </form>
        ) : null}

        <div className="mt-3 divide-y divide-border rounded border border-border">
          {list.length === 0 ? (
            <p className="p-3 text-sm text-steel">
              No coach contacts saved yet for this school.
            </p>
          ) : (
            list.map((row) => (
              <div
                key={row.id}
                className={`flex items-start justify-between gap-2 px-3 py-2 ${
                  coach?.id === row.id ? "bg-org-primary/5" : ""
                }`}
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() => {
                    setSelected(row.id);
                    setTouched(false);
                  }}
                >
                  <p className="text-sm font-semibold text-graphite">{row.coach_name}</p>
                  <p className="meta text-steel">
                    {[row.coach_role, row.email, row.phone].filter(Boolean).join(" · ") ||
                      "No email yet"}
                  </p>
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-steel hover:text-seam-red"
                    onClick={() => removeContact.mutate(row.id)}
                    aria-label={`Remove ${row.coach_name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <h3 className="meta text-steel">The email</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUBJECT_TEMPLATES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTemplateId(item.id);
                setTouched(false);
              }}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                templateId === item.id
                  ? "border-org-primary bg-org-primary/10 text-org-primary"
                  : "border-border text-steel hover:text-graphite"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Input
          value={draftSubject}
          onChange={(event) => {
            setTouched(true);
            setSubject(event.target.value);
            setBody(draftBody);
          }}
          className="mt-3"
        />
        <Textarea
          value={draftBody}
          onChange={(event) => {
            setTouched(true);
            setSubject(draftSubject);
            setBody(event.target.value);
          }}
          rows={18}
          className="mt-2 font-mono text-[13px]"
        />

        {!input.scoutCardUrl ? (
          <p className="mt-2 text-xs text-steel">
            Turn on the shareable profile on the player card to include a coach-ready link.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            className="touch-target"
            disabled={!coach?.email}
            onClick={() => {
              window.location.href = mailtoLink(coach.email, draftSubject, draftBody);
              logSent.mutate();
            }}
          >
            <Mail className="mr-1 size-4" />
            {coach?.email ? "Open in email" : "Add a coach email first"}
          </Button>
          <Button
            variant="outline"
            className="touch-target"
            onClick={() => {
              navigator.clipboard
                .writeText(`Subject: ${draftSubject}\n\n${draftBody}`)
                .then(() => toast.success("Email copied"))
                .catch(() => toast.error("Couldn't copy"));
            }}
          >
            <Copy className="mr-1 size-4" /> Copy
          </Button>
          {entryId ? (
            <Button
              variant="outline"
              className="touch-target"
              onClick={() => {
                logSent.mutate(undefined, {
                  onSuccess: () => toast.success("Logged on this school's activity"),
                });
              }}
            >
              Mark as sent
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
