import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  EVENT_TYPES,
  deleteAthleteMetric,
  deleteScheduleEvent,
  getAthleteProfile,
  saveAthleteMetric,
  saveAthleteProfile,
  saveScheduleEvent,
  setAthletePhoto,
  setAthleteSharing,
} from "@/lib/athlete-profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { OrgMark } from "@/components/brand/OrgMark";
import { SocialLinks } from "@/components/athlete/SocialLinks";
import {
  formatHeight,
  formatMetric,
  latestByMetric,
  metricDef,
  metricLabel,
  metricSourceLabel,
  metricStep,
  metricUnit,
  metricsForSport,
  parseHeightInput,
  splitHeight,
} from "@/lib/athlete-metrics";

import { HelpTip } from "@/components/brand/HelpTip";
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

/** The stored row turned back into editable text fields. */
function formFrom(athlete: Record<string, any>): Record<string, string> {
  return {
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
  };
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
  const setPhotoFn = useServerFn(setAthletePhoto);
  const queryClient = useQueryClient();
  const photoInput = useRef<HTMLInputElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

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
  /** The card is a finished page by default; the form only appears on request. */
  const [editing, setEditing] = useState(false);
  const resetForm = () => {
    if (!athlete) return;
    setForm(formFrom(athlete));
    setVideos(((athlete['video_links'] ?? []) as string[]).filter(Boolean));
  };
  useEffect(() => {
    if (!athlete) return;
    setForm(formFrom(athlete));
    setVideos(((athlete['video_links'] ?? []) as string[]).filter(Boolean));
  }, [athlete?.['id'], athlete]);

  // Photos are kept private, so the card asks for a short-lived link each time.
  const storedPhoto = (athlete?.['photo_path'] ?? null) as string | null;
  useEffect(() => {
    let live = true;
    if (!storedPhoto) {
      setPhotoUrl(null);
      return;
    }
    supabase.storage
      .from("athlete-photos")
      .createSignedUrl(storedPhoto, 60 * 60)
      .then(({ data: signed }) => {
        if (live) setPhotoUrl(signed?.signedUrl ?? null);
      });
    return () => {
      live = false;
    };
  }, [storedPhoto]);

  const pickPhoto = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("That picture is over 5MB — please choose a smaller one.");
      return;
    }
    setPhotoBusy(true);
    try {
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${athleteId}/photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("athlete-photos")
        .upload(path, file, { upsert: true, ...(file.type ? { contentType: file.type } : {}) });
      if (upErr) throw new Error(upErr.message);
      await setPhotoFn({ data: { athleteId, photoPath: path } });
      await invalidate();
      toast.success("Photo added");
    } catch (err) {
      const raw = (err as Error).message ?? "";
      toast.error(
        /row-level security|not authorized|permission/i.test(raw)
          ? "You do not have permission to change this player's photo."
          : raw || "The photo could not be saved.",
      );
    } finally {
      setPhotoBusy(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await setPhotoFn({ data: { athleteId, photoPath: null } });
      await invalidate();
      toast.success("Photo removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };

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

  /** Height is typed the way people say it: feet and inches, stored as inches. */
  const heightParts = splitHeight(form['heightInches']);
  const setHeight = (feet: string, inches: string) => {
    const f = feet === "" ? null : Number(feet);
    const i = inches === "" ? 0 : Number(inches);
    setForm((prev) => ({ ...prev, heightInches: f === null ? "" : String(f * 12 + i) }));
  };
  const heightField = () => (
    <div className="block">
      <span className={labelClass}>Height (ft / in)</span>
      <div className="mt-1 flex gap-2">
        <select
          value={String(heightParts.feet)}
          disabled={!canEdit}
          onChange={(e) => setHeight(e.target.value, String(heightParts.inches))}
          className={cn(inputClass, "mt-0", !canEdit && "opacity-70")}
          aria-label="Height in feet"
        >
          <option value="">ft</option>
          {[4, 5, 6, 7].map((f) => (
            <option key={f} value={f}>{f}&apos;</option>
          ))}
        </select>
        <select
          value={String(heightParts.inches)}
          disabled={!canEdit}
          onChange={(e) => setHeight(String(heightParts.feet), e.target.value)}
          className={cn(inputClass, "mt-0", !canEdit && "opacity-70")}
          aria-label="Height in inches"
        >
          <option value="">in</option>
          {Array.from({ length: 12 }, (_, i) => i).map((i) => (
            <option key={i} value={i}>{i}&quot;</option>
          ))}
        </select>
      </div>
    </div>
  );


  // What the card can show, grouped the way a college coach reads it. Blank
  // rows are left out entirely — the card shows what is on file, nothing else.
  const groups: { title: string; rows: [string, string | null][] }[] = [
    {
      title: "Reach the player",
      rows: [
        ["Player email", athlete['athlete_email'] ?? null],
        ["Player phone", athlete['athlete_phone'] ?? null],
        ["Parent / guardian", athlete['parent_name'] ?? null],
        ["Parent email", athlete['parent_email'] ?? null],
        ["Parent phone", athlete['parent_phone'] ?? null],
      ],
    },
    {
      title: "Where they play",
      rows: [
        ["High school", athlete['high_school'] ?? null],
        ["Club / travel team", athlete['club_team'] ?? null],
        [
          "Home town",
          [athlete['home_city'], athlete['home_state']].filter(Boolean).join(", ") || null,
        ],
        ["Secondary position", athlete['secondary_position'] ?? null],
      ],
    },
    {
      title: "Academics",
      rows: [
        ["GPA", athlete['gpa'] ? String(athlete['gpa']) : null],
        ["SAT", athlete['sat_score'] ? String(athlete['sat_score']) : null],
        ["ACT", athlete['act_score'] ? String(athlete['act_score']) : null],
        ["NCAA / NAIA ID", athlete['eligibility_id'] ?? null],
      ],
    },
  ].map((group) => ({ ...group, rows: group.rows.filter(([, value]) => Boolean(value)) as [string, string][] }));

  const storedVideos = ((athlete['video_links'] ?? []) as string[]).filter(Boolean);
  const filledCount =
    groups.reduce((sum, group) => sum + group.rows.length, 0) +
    storedVideos.length +
    (athlete['height_inches'] ? 1 : 0) +
    (athlete['weight_lbs'] ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Player card — a finished showcase, with the form kept behind Edit. */}
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-xl font-bold text-graphite">Player card</h2>
            <HelpTip label="About the player card">
              Contact details, school and grades. College coaches ask for all of this first, and
              everything saved here shows on the shareable card you send them.
            </HelpTip>
          </div>
          {canEdit && filledCount > 0 ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="touch-target inline-flex items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-semibold text-graphite hover:border-org-primary hover:text-org-primary"
            >
              <Pencil className="size-3.5" aria-hidden />
              {editing ? "Done editing" : "Edit card"}
            </button>
          ) : null}
        </div>

        {!editing ? (
          filledCount === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-2/60 p-6 text-center">
              <p className="font-display text-base font-bold text-graphite">
                This card is empty
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-steel">
                Add the details every college coach asks for first — how to reach the player, where
                they play, grades and video. They appear here as soon as they are saved.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="touch-target mt-4 inline-flex items-center gap-1.5 rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground"
                >
                  <Plus className="size-4" aria-hidden /> Fill in the player card
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {athlete['height_inches'] || athlete['weight_lbs'] ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  {athlete['height_inches'] ? (
                    <div className="rounded-xl border border-border bg-surface-2 px-5 py-3">
                      <p className={labelClass}>Height</p>
                      <p className="font-display mt-0.5 text-2xl font-bold tabular-nums text-graphite">
                        {formatHeight(athlete['height_inches'])}
                      </p>
                    </div>
                  ) : null}
                  {athlete['weight_lbs'] ? (
                    <div className="rounded-xl border border-border bg-surface-2 px-5 py-3">
                      <p className={labelClass}>Weight</p>
                      <p className="font-display mt-0.5 text-2xl font-bold tabular-nums text-graphite">
                        {String(athlete['weight_lbs'])} lb
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                {groups
                  .filter((group) => group.rows.length > 0)
                  .map((group) => (
                    <div key={group.title}>
                      <p className={labelClass}>{group.title}</p>
                      <dl className="mt-2">
                        {group.rows.map(([label, value]) => (
                          <div
                            key={label}
                            className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2 last:border-0"
                          >
                            <dt className="text-sm text-steel">{label}</dt>
                            <dd className="text-right text-sm font-semibold text-graphite">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
              </div>

              {storedVideos.length ? (
                <div className="mt-5">
                  <p className={labelClass}>Highlight videos</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {storedVideos.map((url, index) => (
                      <a
                        key={url + index}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="touch-target inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm font-semibold text-org-primary hover:border-org-primary"
                      >
                        <Play className="size-3.5" aria-hidden /> Video {index + 1}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )
        ) : null}

        <div className={cn("mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3", !editing && "hidden")}>
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
          {heightField()}
          {field("weightLbs", "Weight (lb)", "number")}

          {field("gpa", "GPA", "number", { step: "0.01" })}
          {field("satScore", "SAT", "number")}
          {field("actScore", "ACT", "number")}
          {field("eligibilityId", "NCAA / NAIA ID")}
          {field("twitterHandle", "X handle")}
          {field("instagramHandle", "Instagram handle")}
        </div>

        <div className={cn("mt-4", !editing && "hidden")}>
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

        {canEdit && editing ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                saveProfile.mutate(undefined, { onSuccess: () => setEditing(false) })
              }
              disabled={saveProfile.isPending}
              className="touch-target inline-flex items-center rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
            >
              {saveProfile.isPending ? "Saving…" : "Save player card"}
            </button>
            {filledCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setEditing(false);
                }}
                className="touch-target inline-flex items-center rounded-xl border border-border px-4 text-sm font-semibold text-steel hover:text-graphite"
              >
                Cancel
              </button>
            ) : null}
          </div>
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
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-xl font-bold text-graphite">Measurables</h2>
          <HelpTip label="About measurables">
            Each number keeps its date and where it came from, so a new test result never erases the
            old one. Results from testing services land here too.
          </HelpTip>
        </div>

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
              // Height is entered as 6'2"; everything else is a plain number in
              // its own unit (mph, sec, in, lb) and is stored with that unit.
              const value =
                metricKey === "height" ? parseHeightInput(metricValue) : Number(metricValue);
              if (value === null || !Number.isFinite(Number(value))) {
                toast.error(
                  metricKey === "height"
                    ? "Enter the height as 6'2\"."
                    : `Enter the number in ${metricUnit(metricKey) || "its unit"}.`,
                );
                return;
              }
              try {
                await saveMetricFn({
                  data: {
                    athleteId,
                    metricKey,
                    value: String(value),
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
                onChange={(e) => {
                  setMetricKey(e.target.value);
                  setMetricValue("");
                }}
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
              <span className={labelClass}>
                Value {metricKey ? `(${metricKey === "height" ? "ft'in\"" : metricUnit(metricKey)})` : ""}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  required
                  type={metricKey === "height" ? "text" : "number"}
                  inputMode="decimal"
                  step={metricKey === "height" ? undefined : String(metricStep(metricKey))}
                  placeholder={metricKey === "height" ? `6'2"` : ""}
                  value={metricValue}
                  onChange={(e) => setMetricValue(e.target.value)}
                  className={cn(inputClass, "mt-0 w-28")}
                />
                <span className="font-mono text-[11px] uppercase text-steel">
                  {metricKey === "height" ? "ft / in" : metricUnit(metricKey)}
                </span>
              </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <h2 className="font-display text-xl font-bold text-graphite">
              Where to see this player
            </h2>
            <HelpTip label="About the schedule">
              Team events your club posts show up here automatically. Add your own for guest play,
              showcases or camps the club has not listed.
            </HelpTip>
          </div>
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
