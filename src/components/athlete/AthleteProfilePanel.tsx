import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  EVENT_TYPES,
  deleteAthleteMetric,
  deleteScheduleEvent,
  getAthleteProfile,
  saveAthleteMetric,
  saveAthleteProfile,
  saveScheduleEvent,
  setAthleteSharing,
} from "@/lib/athlete-profile.functions";
import {
  formatHeight,
  formatMetric,
  latestByMetric,
  metricDef,
  metricLabel,
  metricSourceLabel,
  metricsForSport,
} from "@/lib/athlete-metrics";
import { normalizeSport } from "@/lib/sport";
import { cn } from "@/lib/utils";

/**
 * The athlete's own record: how to reach them, where they go to school, their
 * numbers, and where they are playing next. Staff and family see the same panel
 * and write to the same rows, so a figure typed by a parent is the figure a
 * coach reads.
 */

const cardClass =
  "rounded-xl border border-border bg-card p-6 shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]";
const labelClass = "font-mono text-[11px] tracking-wide text-steel uppercase";
const inputClass =
  "touch-target mt-1 w-full rounded-lg border border-border bg-card px-3 text-sm text-graphite";

/** Full link, so copy-paste into an email works. */
function shareUrl(slug: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/p/${slug}`;
}

type Props = { athleteId: string; canEdit?: boolean };

export function AthleteProfilePanel({ athleteId, canEdit = true }: Props) {
  const profileFn = useServerFn(getAthleteProfile);
  const saveProfileFn = useServerFn(saveAthleteProfile);
  const saveMetricFn = useServerFn(saveAthleteMetric);
  const deleteMetricFn = useServerFn(deleteAthleteMetric);
  const saveEventFn = useServerFn(saveScheduleEvent);
  const deleteEventFn = useServerFn(deleteScheduleEvent);
  const setSharingFn = useServerFn(setAthleteSharing);
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: () => profileFn({ data: { athleteId } }),
    retry: false,
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["athlete-profile", athleteId] }),
      queryClient.invalidateQueries({ queryKey: ["family-portal"] }),
      queryClient.invalidateQueries({ queryKey: ["org-athlete", athleteId] }),
    ]);

  const athlete = data?.athlete;
  const sport = normalizeSport(athlete?.['sport']);
  const metrics = (data?.metrics ?? []) as Record<string, any>[];
  const events = (data?.events ?? []) as Record<string, any>[];

  const [form, setForm] = useState<Record<string, string>>({});
  const [videos, setVideos] = useState<string[]>([]);
  useEffect(() => {
    if (!athlete) return;
    setForm({
      athleteEmail: athlete['athlete_email'] ?? "",
      athletePhone: athlete['athlete_phone'] ?? "",
      parentName: athlete['parent_name'] ?? "",
      parentEmail: athlete['parent_email'] ?? "",
      parentPhone: athlete['parent_phone'] ?? "",
      homeCity: athlete['home_city'] ?? "",
      homeState: athlete['home_state'] ?? "",
      highSchool: athlete['high_school'] ?? "",
      clubTeam: athlete['club_team'] ?? "",
      secondaryPosition: athlete['secondary_position'] ?? "",
      heightInches: athlete['height_inches'] ?? "",
      weightLbs: athlete['weight_lbs'] ?? "",
      gpa: athlete['gpa'] ?? "",
      satScore: athlete['sat_score'] ?? "",
      actScore: athlete['act_score'] ?? "",
      eligibilityId: athlete['eligibility_id'] ?? "",
      twitterHandle: athlete['twitter_handle'] ?? "",
      instagramHandle: athlete['instagram_handle'] ?? "",
    });
    setVideos(((athlete['video_links'] ?? []) as string[]).filter(Boolean));
  }, [athlete?.['id'], athlete]);

  const saveProfile = useMutation({
    mutationFn: async () => saveProfileFn({ data: { athleteId, ...form, videoLinks: videos } as any }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Player card saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const share = useMutation({
    mutationFn: async (input: { enabled: boolean; shareContact: boolean }) =>
      setSharingFn({ data: { athleteId, ...input } }),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(result.enabled ? "Shareable link is live" : "Sharing turned off");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const [metricKey, setMetricKey] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [metricDate, setMetricDate] = useState("");
  const [metricSource, setMetricSource] = useState("manual");

  const [eventOpen, setEventOpen] = useState(false);
  const [event, setEvent] = useState({
    name: "",
    eventType: "tournament",
    startDate: "",
    endDate: "",
    venue: "",
    city: "",
    state: "",
    linkUrl: "",
  });

  if (error) {
    return (
      <p className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-4 text-sm text-seam-red">
        {(error as Error).message}
      </p>
    );
  }
  if (isPending || !athlete) return <p className="text-sm text-steel">Loading player card…</p>;

  const latest = latestByMetric(metrics as any[]);
  const upcoming = events.filter((row) => String(row['start_date']) >= new Date().toISOString().slice(0, 10));

  const field = (key: string, label: string, type = "text", extra?: Record<string, unknown>) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        value={form[key] ?? ""}
        disabled={!canEdit}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className={cn(inputClass, !canEdit && "opacity-70")}
        {...extra}
      />
    </label>
  );

  return (
    <div className="space-y-6">
      {/* Contact + academics */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-graphite">Player card</h2>
          <p className="text-sm text-steel">
            {formatHeight(athlete['height_inches'])}
            {athlete['weight_lbs'] ? ` · ${athlete['weight_lbs']} lb` : ""}
          </p>
        </div>
        <p className="mt-1 text-sm text-steel">
          Contact details, school and grades. College coaches ask for all of this first.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field("athleteEmail", "Player email", "email")}
          {field("athletePhone", "Player phone", "tel")}
          {field("parentName", "Parent / guardian")}
          {field("parentEmail", "Parent email", "email")}
          {field("parentPhone", "Parent phone", "tel")}
          {field("highSchool", "High school")}
          {field("clubTeam", "Club / travel team")}
          {field("homeCity", "Home town")}
          {field("homeState", "State", "text", { maxLength: 2 })}
          {field("secondaryPosition", "Secondary position")}
          {field("heightInches", "Height (inches)", "number")}
          {field("weightLbs", "Weight (lb)", "number")}
          {field("gpa", "GPA", "number", { step: "0.01" })}
          {field("satScore", "SAT", "number")}
          {field("actScore", "ACT", "number")}
          {field("eligibilityId", "NCAA / NAIA ID")}
          {field("twitterHandle", "X handle")}
          {field("instagramHandle", "Instagram handle")}
        </div>

        <div className="mt-4">
          <span className={labelClass}>Highlight videos</span>
          <div className="mt-1 space-y-2">
            {videos.map((url, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={url}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setVideos((list) => list.map((v, i) => (i === index ? e.target.value : v)))
                  }
                  className={inputClass}
                  placeholder="https://"
                />
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setVideos((list) => list.filter((_, i) => i !== index))}
                    className="touch-target rounded-lg border border-border px-3 text-steel hover:border-seam-red hover:text-seam-red"
                    aria-label="Remove video link"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setVideos((list) => [...list, ""])}
                className="touch-target inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 text-sm font-semibold text-steel hover:border-org-primary hover:text-org-primary"
              >
                <Plus className="size-4" aria-hidden /> Add a video link
              </button>
            ) : null}
          </div>
        </div>

        {canEdit ? (
          <button
            type="button"
            onClick={() => saveProfile.mutate()}
            disabled={saveProfile.isPending}
            className="touch-target mt-5 inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
          >
            {saveProfile.isPending ? "Saving…" : "Save player card"}
          </button>
        ) : null}

        {/* Shareable card link — what a college coach opens from an email. */}
        <div className="mt-5 border-t border-border pt-4">
          <p className={labelClass}>Shareable profile link</p>
          {athlete['share_enabled'] && athlete['share_slug'] ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href={`/p/${String(athlete['share_slug'])}`}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs font-semibold text-org-primary hover:underline"
              >
                {shareUrl(String(athlete['share_slug']))}
              </a>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(shareUrl(String(athlete['share_slug'])));
                  toast.success("Link copied");
                }}
                className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-graphite hover:border-org-primary"
              >
                Copy link
              </button>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      share.mutate({ enabled: true, shareContact: !athlete['share_contact'] })
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-graphite hover:border-org-primary"
                  >
                    {athlete['share_contact'] ? "Hide contact details" : "Show contact details"}
                  </button>
                  <button
                    type="button"
                    onClick={() => share.mutate({ enabled: false, shareContact: Boolean(athlete['share_contact']) })}
                    className="rounded-md border border-seam-red/40 px-2 py-1 text-xs font-semibold text-seam-red hover:bg-seam-red-tint"
                  >
                    Turn off
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-steel">
                Off. Turn it on to get a link you can send to a college coach — it shows this card,
                the measurables, video and upcoming events. No account needed to open it.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => share.mutate({ enabled: true, shareContact: true })}
                  disabled={share.isPending}
                  className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-graphite hover:border-org-primary disabled:opacity-60"
                >
                  {share.isPending ? "Creating…" : "Create shareable link"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* Measurables */}
      <section className={cardClass}>
        <h2 className="font-display text-xl font-bold text-graphite">Measurables</h2>
        <p className="mt-1 text-sm text-steel">
          Each number keeps its date and where it came from, so a new test result never erases the
          old one. Results from testing services land here too.
        </p>

        {latest.length === 0 ? (
          <p className="mt-4 text-sm text-steel">No numbers recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <tbody>
                {latest.map((row) => (
                  <tr key={String(row['id'])} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-2 text-left font-semibold text-graphite">
                      {metricLabel(String(row['metric_key']))}
                    </th>
                    <td className="px-3 py-2 font-semibold tabular-nums text-graphite">
                      {formatMetric(row['value'], String(row['metric_key']))}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-steel">
                      {row['recorded_on'] ?? "no date"} · {metricSourceLabel(row['source'])}
                      {row['verified'] ? " · verified" : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await deleteMetricFn({ data: { id: String(row['id']) } });
                              await invalidate();
                            } catch (err) {
                              toast.error((err as Error).message);
                            }
                          }}
                          className="text-steel hover:text-seam-red"
                          aria-label={`Remove ${metricLabel(String(row['metric_key']))}`}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit ? (
          <form
            className="mt-4 flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveMetricFn({
                  data: {
                    athleteId,
                    metricKey,
                    value: metricValue,
                    recordedOn: metricDate || null,
                    source: metricSource,
                    unit: metricDef(metricKey)?.unit ?? null,
                  },
                });
                setMetricValue("");
                setMetricDate("");
                await invalidate();
                toast.success("Measurable added");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <label className="block">
              <span className={labelClass}>Measurable</span>
              <select
                required
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value)}
                className={inputClass}
              >
                <option value="">Choose…</option>
                {metricsForSport(sport).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label} ({m.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Value</span>
              <input
                required
                type="number"
                step="0.01"
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
                className={cn(inputClass, "w-28")}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Date</span>
              <input
                type="date"
                value={metricDate}
                onChange={(e) => setMetricDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Source</span>
              <select
                value={metricSource}
                onChange={(e) => setMetricSource(e.target.value)}
                className={inputClass}
              >
                <option value="manual">Entered by hand</option>
                <option value="curve_testing">Curve Testing</option>
                <option value="handled_reports">HandledReports</option>
                <option value="perfect_game">Perfect Game</option>
                <option value="prep_baseball_report">Prep Baseball Report</option>
                <option value="other">Another service</option>
              </select>
            </label>
            <button
              type="submit"
              className="touch-target inline-flex items-center rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground"
            >
              Add
            </button>
          </form>
        ) : null}
      </section>

      {/* Schedule */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-graphite">Where to see this player</h2>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEventOpen((open) => !open)}
              className="touch-target inline-flex items-center gap-1 rounded-xl border border-border px-4 text-sm font-semibold text-graphite hover:border-org-primary"
            >
              <Plus className="size-4" aria-hidden /> Add an event
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-steel">
          Team events your club posts show up here automatically. Add your own for guest play,
          showcases or camps the club has not listed.
        </p>

        {eventOpen && canEdit ? (
          <form
            className="mt-4 grid gap-3 rounded-lg border border-border bg-chalk/60 p-4 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveEventFn({ data: { athleteId, ...event } });
                setEvent({
                  name: "",
                  eventType: "tournament",
                  startDate: "",
                  endDate: "",
                  venue: "",
                  city: "",
                  state: "",
                  linkUrl: "",
                });
                setEventOpen(false);
                await invalidate();
                toast.success("Event added");
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <label className="block sm:col-span-2">
              <span className={labelClass}>Event name</span>
              <input
                required
                value={event.name}
                onChange={(e) => setEvent((v) => ({ ...v, name: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Type</span>
              <select
                value={event.eventType}
                onChange={(e) => setEvent((v) => ({ ...v, eventType: e.target.value }))}
                className={inputClass}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type[0]!.toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Starts</span>
              <input
                required
                type="date"
                value={event.startDate}
                onChange={(e) => setEvent((v) => ({ ...v, startDate: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Ends</span>
              <input
                type="date"
                value={event.endDate}
                onChange={(e) => setEvent((v) => ({ ...v, endDate: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Venue</span>
              <input
                value={event.venue}
                onChange={(e) => setEvent((v) => ({ ...v, venue: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>City</span>
              <input
                value={event.city}
                onChange={(e) => setEvent((v) => ({ ...v, city: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>State</span>
              <input
                maxLength={2}
                value={event.state}
                onChange={(e) => setEvent((v) => ({ ...v, state: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Link</span>
              <input
                value={event.linkUrl}
                onChange={(e) => setEvent((v) => ({ ...v, linkUrl: e.target.value }))}
                className={inputClass}
                placeholder="https://"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="touch-target inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground"
              >
                Save event
              </button>
            </div>
          </form>
        ) : null}

        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-steel">Nothing on the calendar yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
            {upcoming.map((row) => (
              <li key={String(row['id'])} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-graphite">{String(row['name'])}</p>
                  <p className="font-mono text-[11px] text-steel">
                    {[
                      String(row['start_date']),
                      row['end_date'] ? `→ ${row['end_date']}` : null,
                      row['venue'],
                      [row['city'], row['state']].filter(Boolean).join(", ") || null,
                      row['team_id'] ? "team event" : "added by the family",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {canEdit && row['org_athlete_id'] ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteEventFn({ data: { id: String(row['id']) } });
                        await invalidate();
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                    className="text-steel hover:text-seam-red"
                    aria-label={`Remove ${String(row['name'])}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
