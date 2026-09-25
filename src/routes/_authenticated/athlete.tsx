import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Copy,
  Eye,
  Film,
  GraduationCap,
  MapPin,
  MessageSquareQuote,
  Plus,
  Share2,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/brand/AppShell";
import { AuthButton } from "@/components/brand/AuthButton";
import { supabase } from "@/integrations/supabase/client";
import {
  addAthleteVideo,
  deleteAthleteVideo,
  getAthleteHub,
  VIDEO_CATEGORIES,
} from "@/lib/athlete-hub.functions";
import { saveAthleteMetric, setAthleteSharing } from "@/lib/athlete-profile.functions";
import {
  formatHeight,
  formatMetric,
  latestByMetric,
  metricDef,
  metricLabel,
  metricsForSport,
} from "@/lib/athlete-metrics";
import { normalizeSport } from "@/lib/sport";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/athlete")({
  head: () => ({
    meta: [
      { title: "My recruiting hub — Curve Recruit" },
      {
        name: "description",
        content:
          "Your scout card, measurables, video and college list in one place — with the next step always in view.",
      },
      { property: "og:title", content: "My recruiting hub — Curve Recruit" },
      {
        property: "og:description",
        content: "Scout card, measurables, video and college targets for a recruit.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AthleteHub,
});

type Hub = Awaited<ReturnType<typeof getAthleteHub>>;

const STAGES = [
  { key: "researching", label: "Researching" },
  { key: "contacted", label: "Contacted" },
  { key: "offered", label: "Offered" },
  { key: "committed", label: "Committed" },
] as const;

function AthleteHub() {
  const hubFn = useServerFn(getAthleteHub);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["athlete-hub"],
    queryFn: () => hubFn({ data: {} }),
    staleTime: 30_000,
  });

  return (
    <AppShell right={<AuthButton />}>
      {error ? (
        <div className="rounded-xl border border-seam-red/30 bg-seam-red-tint p-5 text-sm text-seam-red">
          <p className="font-semibold">We couldn't load your hub.</p>
          <p className="mt-1 opacity-80">{(error as Error).message}</p>
          <button onClick={() => refetch()} className="mt-3 font-semibold underline">
            Try again
          </button>
        </div>
      ) : isPending ? (
        <HubSkeleton />
      ) : !data?.athlete ? (
        <NoAthlete />
      ) : (
        <HubBody hub={data as Extract<Hub, { photoUrl: any }>} />
      )}
    </AppShell>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-64 animate-pulse rounded-2xl bg-card" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </div>
      <p className="meta text-steel">Loading your recruiting hub…</p>
    </div>
  );
}

function NoAthlete() {
  return (
    <div className="stadium-gradient rounded-2xl px-6 py-14 text-center">
      <p className="meta text-org-accent">Recruiting hub</p>
      <h1 className="font-display mt-3 text-3xl font-bold text-white">Your card isn't linked yet</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-white/70">
        Ask your club's staff to send your player invite. Once it's accepted, your scout card,
        numbers and college list show up right here.
      </p>
      <Link
        to="/search"
        className="touch-target mt-6 inline-flex items-center gap-2 rounded-xl bg-org-primary px-5 text-sm font-semibold text-org-primary-foreground"
      >
        Explore colleges <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HubBody({ hub }: { hub: any }) {
  const athlete = hub.athlete as Record<string, any>;
  const sport = normalizeSport(athlete['sport']);
  const metrics = hub.metrics as Record<string, any>[];
  const videos = hub.videos as Record<string, any>[];
  const saved = hub.saved as Record<string, any>[];
  const latest = useMemo(() => latestByMetric(metrics as any[]) as any[], [metrics]);
  const linkVideos = ((athlete['video_links'] ?? []) as string[]).filter(Boolean);
  const activeTargets = saved.filter((s) => s['status'] !== "eliminated");

  const checklist = [
    { key: "photo", label: "Add a photo", done: Boolean(hub.photoUrl), href: "#profile" },
    {
      key: "basics",
      label: "Grad year, position & school",
      done: Boolean(athlete['grad_year'] && athlete['primary_position'] && athlete['high_school']),
      href: "#profile",
    },
    { key: "gpa", label: "GPA on file", done: athlete['gpa'] != null, href: "#profile" },
    {
      key: "metrics",
      label: "At least 3 measurables",
      done: latest.length >= 3,
      progress: `${Math.min(latest.length, 3)}/3`,
      href: "#measurables",
    },
    {
      key: "video",
      label: "Upload a highlight clip",
      done: videos.length + linkVideos.length > 0,
      href: "#video",
    },
    {
      key: "ncaa",
      label: "NCAA Eligibility Center ID",
      done: Boolean(athlete['eligibility_id']),
      href: "#profile",
    },
    {
      key: "targets",
      label: "10 target colleges",
      done: activeTargets.length >= 10,
      progress: `${Math.min(activeTargets.length, 10)}/10`,
      href: "#targets",
    },
    {
      key: "share",
      label: "Scout card switched on",
      done: Boolean(athlete['share_enabled']),
      href: "#top",
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;
  const pct = Math.round((doneCount / checklist.length) * 100);
  const next = checklist.find((c) => !c.done) ?? null;

  return (
    <div className="space-y-5 sm:space-y-6">
      <Hero hub={hub} pct={pct} next={next} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] sm:gap-6">
        <div className="space-y-5 sm:space-y-6">
          <VideoReel athleteId={athlete['id']} videos={videos} linkVideos={linkVideos} />
          <Measurables athlete={athlete} sport={sport} latest={latest} />
        </div>
        <div className="space-y-5 sm:space-y-6">
          <Readiness checklist={checklist} pct={pct} doneCount={doneCount} />
          <Targets saved={saved} />
          <CoachCorner notes={hub.notes} events={hub.events} orgName={hub.orgName} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Hero ---------------------------------- */

function Hero({ hub, pct, next }: { hub: any; pct: number; next: any }) {
  const athlete = hub.athlete as Record<string, any>;
  const qc = useQueryClient();
  const shareFn = useServerFn(setAthleteSharing);
  const [copied, setCopied] = useState(false);
  const share = useMutation({
    mutationFn: () => shareFn({ data: { athleteId: athlete['id'], enabled: true } }),
    onSuccess: () => {
      toast.success("Your scout card is live");
      qc.invalidateQueries({ queryKey: ["athlete-hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const slug = athlete['share_slug'] as string | null;
  const live = Boolean(athlete['share_enabled'] && slug);
  const url = live && typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : "";

  const copy = async () => {
    if (!url) return;
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ title: `${athlete['name']} — recruiting profile`, url });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied — paste it into a text or email to a coach");
    setTimeout(() => setCopied(false), 2200);
  };

  const initials = String(athlete['name'] ?? "")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const facts = [
    athlete['grad_year'] ? `Class of ${athlete['grad_year']}` : null,
    [athlete['primary_position'], athlete['secondary_position']].filter(Boolean).join(" / ") || null,
    athlete['bats'] || athlete['throws']
      ? `B/T ${athlete['bats'] ?? "–"}/${athlete['throws'] ?? "–"}`
      : null,
    athlete['height_inches'] ? formatHeight(athlete['height_inches']) : null,
    athlete['weight_lbs'] ? `${athlete['weight_lbs']} lb` : null,
  ].filter(Boolean) as string[];

  return (
    <section
      id="top"
      className="stadium-gradient relative overflow-hidden rounded-2xl border border-white/10"
    >
      {/* diamond linework */}
      <svg
        className="pointer-events-none absolute -right-24 -bottom-32 size-[420px] text-white/[0.05]"
        viewBox="0 0 100 100"
        aria-hidden
      >
        <path d="M50 8 L92 50 L50 92 L8 50 Z" fill="none" stroke="currentColor" strokeWidth="0.6" />
        <path d="M50 26 L74 50 L50 74 L26 50 Z" fill="none" stroke="currentColor" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="3" fill="currentColor" />
      </svg>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, var(--org-primary), transparent)",
        }}
        aria-hidden
      />

      <div className="relative grid gap-6 px-5 py-6 sm:px-8 sm:py-8 md:grid-cols-[auto_1fr_auto] md:items-center">
        {/* Photo */}
        <div className="flex items-center gap-4 md:block">
          <div className="relative">
            <div
              className="size-24 overflow-hidden rounded-2xl ring-2 ring-org-primary/70 ring-offset-4 ring-offset-navy-deep sm:size-32"
              style={{ background: "var(--org-primary-tint)" }}
            >
              {hub.photoUrl ? (
                <img src={hub.photoUrl} alt={athlete['name']} className="size-full object-cover" />
              ) : (
                <div className="font-display grid size-full place-items-center text-3xl font-bold text-org-primary">
                  {initials}
                </div>
              )}
            </div>
            {athlete['grad_year'] ? (
              <span className="font-display tabular absolute -right-2 -bottom-2 rounded-lg bg-org-primary px-2 py-0.5 text-sm font-bold text-org-primary-foreground shadow-lg">
                '{String(athlete['grad_year']).slice(-2)}
              </span>
            ) : null}
          </div>
          <div className="md:hidden">
            <p className="meta text-org-accent">{hub.orgName ?? "Recruiting hub"}</p>
            <h1 className="font-display text-2xl leading-tight font-bold text-white">
              {athlete['name']}
            </h1>
          </div>
        </div>

        {/* Identity */}
        <div className="min-w-0">
          <p className="meta hidden text-org-accent md:block">
            {hub.orgName ?? "Recruiting hub"} · Recruiting hub
          </p>
          <h1 className="font-display mt-1 hidden text-4xl leading-[1.05] font-bold tracking-tight text-white md:block lg:text-5xl">
            {athlete['name']}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span
                key={f}
                className="tabular rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-[11px] tracking-wide text-white/85 uppercase"
              >
                {f}
              </span>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/65">
            {athlete['high_school'] ? (
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-4" /> {athlete['high_school']}
              </span>
            ) : null}
            {athlete['home_city'] || athlete['home_state'] ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" />
                {[athlete['home_city'], athlete['home_state']].filter(Boolean).join(", ")}
              </span>
            ) : null}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {live ? (
              <>
                <button
                  onClick={copy}
                  className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground shadow-[0_8px_24px_-10px_var(--org-primary)] transition-transform active:scale-[0.98]"
                >
                  {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
                  {copied ? "Copied" : "Share my scout card"}
                </button>
                <a
                  href={`/p/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="touch-target inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 text-sm font-semibold text-white hover:border-white/50"
                >
                  <Eye className="size-4" /> See what coaches see
                </a>
              </>
            ) : (
              <button
                onClick={() => share.mutate()}
                disabled={share.isPending}
                className="touch-target inline-flex items-center gap-2 rounded-xl bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
              >
                <Share2 className="size-4" />
                {share.isPending ? "Turning on…" : "Turn on my scout card"}
              </button>
            )}
          </div>
        </div>

        {/* Readiness ring */}
        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:flex-col md:p-5 md:text-center">
          <Ring pct={pct} />
          <div className="md:max-w-[180px]">
            <p className="meta text-white/60">Recruiting ready</p>
            {next ? (
              <a href={next.href} className="mt-1 block text-sm font-semibold text-white hover:underline">
                Next: {next.label} <ArrowRight className="inline size-3.5" />
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold text-diamond-green">Everything's in place</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[84px] shrink-0 md:size-[104px]">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--track)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--org-primary)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display tabular text-2xl font-bold text-white md:text-3xl">
          {pct}
          <span className="text-sm text-white/60">%</span>
        </span>
      </div>
    </div>
  );
}

/* --------------------------- Panels -------------------------------- */

function Panel({
  id,
  eyebrow,
  title,
  action,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="surface-raised scroll-mt-24 rounded-2xl border border-white/10 p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="meta text-org-accent">{eyebrow}</p>
          <h2 className="font-display mt-1 text-xl font-bold tracking-tight text-graphite">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Readiness({
  checklist,
  pct,
  doneCount,
}: {
  checklist: { key: string; label: string; done: boolean; progress?: string; href: string }[];
  pct: number;
  doneCount: number;
}) {
  return (
    <Panel eyebrow={`${doneCount} of ${checklist.length} done`} title="What coaches look for">
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full bg-org-primary transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1">
        {checklist.map((item) => (
          <li key={item.key}>
            <a
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]",
                item.done && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  item.done
                    ? "border-org-primary bg-org-primary text-org-primary-foreground"
                    : "border-white/25",
                )}
              >
                {item.done ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span
                className={cn(
                  "flex-1 text-sm",
                  item.done ? "text-steel line-through decoration-white/20" : "font-medium text-graphite",
                )}
              >
                {item.label}
              </span>
              {item.progress && !item.done ? (
                <span className="tabular font-mono text-[11px] text-steel">{item.progress}</span>
              ) : null}
              {!item.done ? (
                <ArrowRight className="size-3.5 text-steel opacity-0 transition-opacity group-hover:opacity-100" />
              ) : null}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* --------------------------- Video --------------------------------- */

function VideoReel({
  athleteId,
  videos,
  linkVideos,
}: {
  athleteId: string;
  videos: Record<string, any>[];
  linkVideos: string[];
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addAthleteVideo);
  const delFn = useServerFn(deleteAthleteVideo);
  const input = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string>("game");
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const upload = async (file: File) => {
    if (!file.type.startsWith("video/")) return toast.error("Pick a video file");
    if (file.size > 100 * 1024 * 1024) return toast.error("Clips need to be under 100 MB");
    setUploading(file.name);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${athleteId}/videos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("athlete-videos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await addFn({
        data: {
          athleteId,
          storagePath: path,
          title: title || file.name.replace(/\.[^.]+$/, ""),
          category,
          sizeBytes: file.size,
          mimeType: file.type,
        },
      });
      setTitle("");
      setActive(0);
      toast.success("Clip added to your reel");
      qc.invalidateQueries({ queryKey: ["athlete-hub"] });
    } catch (e) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      setActive(0);
      qc.invalidateQueries({ queryKey: ["athlete-hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = videos[active] ?? null;
  const catLabel = (k: string) => VIDEO_CATEGORIES.find((c) => c.key === k)?.label ?? "Clip";

  return (
    <Panel id="video" eyebrow={`${videos.length} clip${videos.length === 1 ? "" : "s"}`} title="Highlight reel">
      {current?.url ? (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
          <video
            key={current.id}
            src={current.url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-graphite">{current.title || "Clip"}</p>
              <p className="meta text-steel">{catLabel(current.category)}</p>
            </div>
            <button
              onClick={() => confirm("Remove this clip?") && remove.mutate(current.id)}
              className="touch-target grid place-items-center rounded-lg px-2 text-steel hover:text-seam-red"
              aria-label="Remove clip"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => input.current?.click()}
          className="group grid aspect-video w-full place-items-center rounded-xl border border-dashed border-white/20 bg-white/[0.02] transition-colors hover:border-org-primary/60 hover:bg-white/[0.04]"
        >
          <div className="text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-org-primary/15 text-org-primary transition-transform group-hover:scale-105">
              <Film className="size-6" />
            </div>
            <p className="font-display mt-3 text-lg font-bold text-graphite">Add your first clip</p>
            <p className="mt-1 text-sm text-steel">Straight from your camera roll · up to 100 MB</p>
          </div>
        </button>
      )}

      {videos.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {videos.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setActive(i)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-left transition-colors",
                i === active
                  ? "border-org-primary bg-org-primary/10"
                  : "border-white/10 hover:border-white/25",
              )}
            >
              <p className="max-w-[140px] truncate text-xs font-semibold text-graphite">{v.title || "Clip"}</p>
              <p className="meta text-steel">{catLabel(v.category)}</p>
            </button>
          ))}
        </div>
      ) : null}

      {/* Upload bar */}
      <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Clip title (e.g. Double vs 88 mph)"
          className="h-11 rounded-lg border border-white/10 bg-transparent px-3 text-sm text-graphite placeholder:text-steel focus:border-org-primary focus:outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-11 rounded-lg border border-white/10 bg-card px-3 text-sm text-graphite focus:border-org-primary focus:outline-none"
        >
          {VIDEO_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => input.current?.click()}
          disabled={Boolean(uploading)}
          className="touch-target inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
        >
          <Upload className="size-4" />
          {uploading ? "Uploading…" : "Upload clip"}
        </button>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </div>
      {uploading ? (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-org-primary" />
          </div>
          <p className="meta mt-1.5 truncate text-steel">Uploading {uploading} — keep this screen open</p>
        </div>
      ) : null}

      {linkVideos.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {linkVideos.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-graphite hover:border-white/30"
            >
              <Film className="size-3.5" /> Linked reel {i + 1}
            </a>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

/* --------------------------- Measurables --------------------------- */

function Measurables({
  athlete,
  sport,
  latest,
}: {
  athlete: Record<string, any>;
  sport: ReturnType<typeof normalizeSport>;
  latest: Record<string, any>[];
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveAthleteMetric);
  const options = metricsForSport(sport).filter((m) => m.group !== "Body");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(options[0]?.key ?? "exit_velo");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: { athleteId: athlete['id'], metricKey: key, value, recordedOn: date, source: "manual" },
      }),
    onSuccess: () => {
      setValue("");
      setOpen(false);
      toast.success("Saved — your coach can verify it");
      qc.invalidateQueries({ queryKey: ["athlete-hub"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shown = latest.filter((m) => metricDef(m['metric_key'])?.group !== "Body");
  const verifiedCount = shown.filter((m) => m['verified']).length;

  return (
    <Panel
      id="measurables"
      eyebrow={`${verifiedCount} verified · ${shown.length - verifiedCount} self-reported`}
      title="Measurables"
      action={
        <button
          onClick={() => setOpen((o) => !o)}
          className="touch-target inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 text-sm font-semibold text-graphite hover:border-org-primary"
        >
          <Plus className="size-4" /> Add
        </button>
      }
    >
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="mb-4 grid gap-2 rounded-xl border border-org-primary/30 bg-org-primary/[0.06] p-3 sm:grid-cols-[1.3fr_1fr_1fr_auto]"
        >
          <select
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="h-11 rounded-lg border border-white/10 bg-card px-3 text-sm text-graphite"
          >
            {options.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({m.unit})
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={metricDef(key)?.unit ?? "Value"}
            className="tabular h-11 rounded-lg border border-white/10 bg-transparent px-3 text-sm text-graphite"
            required
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-lg border border-white/10 bg-transparent px-3 text-sm text-graphite"
          />
          <button
            disabled={save.isPending || !value}
            className="h-11 rounded-lg bg-org-primary px-4 text-sm font-semibold text-org-primary-foreground disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <p className="text-xs text-steel sm:col-span-4">
            Numbers you enter show as <strong className="text-graphite">Self-reported</strong> until a
            coach confirms them.
          </p>
        </form>
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-steel">
          Add your exit velo, 60 time or velocity — they're the first numbers a college coach checks.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {shown.map((m) => {
            const verified = Boolean(m['verified']);
            return (
              <div
                key={m['id']}
                className={cn(
                  "relative rounded-xl border p-3.5",
                  verified
                    ? "border-diamond-green/30 bg-diamond-green-tint"
                    : "border-white/10 bg-white/[0.02]",
                )}
              >
                <p className="meta truncate text-steel">{metricLabel(m['metric_key'])}</p>
                <p className="font-display tabular mt-1.5 text-2xl leading-none font-bold text-graphite">
                  {formatMetric(m['value'], m['metric_key'])}
                </p>
                <p
                  className={cn(
                    "mt-2 inline-flex items-center gap-1 font-mono text-[10px] tracking-wide uppercase",
                    verified ? "text-diamond-green" : "text-steel",
                  )}
                >
                  {verified ? <BadgeCheck className="size-3" /> : null}
                  {verified ? "Coach verified" : "Self-reported"}
                  {m['recorded_on'] ? ` · ${shortDate(m['recorded_on'])}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* --------------------------- Targets ------------------------------- */

function Targets({ saved }: { saved: Record<string, any>[] }) {
  const counts = STAGES.map((s) => ({
    ...s,
    n: saved.filter((r) => r['status'] === s.key).length,
  }));
  const total = counts.reduce((a, b) => a + b.n, 0);
  const levels = new Map<string, number>();
  for (const r of saved) {
    if (r['status'] === "eliminated") continue;
    const p = r['programs'] as any;
    const gb = String(p?.governing_body ?? "");
    const label =
      gb === "NCAA" ? String(p?.division ?? "NCAA").replace(/^Division\s*/i, "D") : gb || "Other";
    levels.set(label, (levels.get(label) ?? 0) + 1);
  }
  const recent = saved.filter((r) => r['status'] !== "eliminated").slice(0, 4);

  return (
    <Panel
      id="targets"
      eyebrow={`${total} active`}
      title="My colleges"
      action={
        <Link
          to="/list"
          className="touch-target inline-flex items-center gap-1 text-sm font-semibold text-org-primary"
        >
          Open list <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {counts.map((s, i) => (
          <div
            key={s.key}
            className="rounded-lg border border-white/10 px-2 py-2.5 text-center"
            style={{
              background: s.n
                ? `color-mix(in oklab, var(${i === 3 ? "--diamond-green" : "--org-primary"}) ${10 + i * 6}%, transparent)`
                : undefined,
            }}
          >
            <p className="font-display tabular text-2xl leading-none font-bold text-graphite">{s.n}</p>
            <p className="mt-1 truncate font-mono text-[9.5px] tracking-wide text-steel uppercase">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {levels.size ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...levels.entries()].map(([l, n]) => (
            <span key={l} className="rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-[11px] text-steel">
              {l} <span className="text-graphite">{n}</span>
            </span>
          ))}
        </div>
      ) : null}

      {recent.length ? (
        <ul className="mt-4 divide-y divide-white/5">
          {recent.map((r) => {
            const p = r['programs'] as any;
            return (
              <li key={r['id']} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  to="/programs/$id"
                  params={{ id: r['program_id'] }}
                  className="min-w-0 truncate text-sm font-medium text-graphite hover:text-org-primary"
                >
                  {p?.universities?.name ?? "College"}
                </Link>
                <span className="shrink-0 font-mono text-[10px] tracking-wide text-steel uppercase">
                  {r['status']}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-steel">
          No colleges yet. Aim for 10–25 across a few levels — reach, target and safety.
        </p>
      )}

      <Link
        to="/search"
        className="touch-target mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-org-primary/40 text-sm font-semibold text-org-primary hover:bg-org-primary/10"
      >
        <Target className="size-4" /> Find colleges to add
      </Link>
    </Panel>
  );
}

/* --------------------------- Coach corner -------------------------- */

function CoachCorner({
  notes,
  events,
  orgName,
}: {
  notes: Record<string, any>[];
  events: Record<string, any>[];
  orgName: string | null;
}) {
  return (
    <Panel eyebrow={orgName ?? "Your club"} title="From your coaches">
      {notes.length ? (
        <div className="space-y-3">
          {notes.map((n) => (
            <blockquote
              key={n['id']}
              className="relative rounded-xl border-l-2 border-org-accent bg-white/[0.03] py-3 pr-3 pl-4"
            >
              <MessageSquareQuote className="absolute top-3 right-3 size-4 text-white/15" />
              <p className="text-sm leading-relaxed text-graphite">{n['note']}</p>
              <p className="meta mt-2 text-steel">{shortDate(n['created_at'])}</p>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="text-sm text-steel">Notes your coaches share with you will show up here.</p>
      )}

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="meta mb-2 text-steel">Up next</p>
        {events.length ? (
          <ul className="space-y-2">
            {events.map((e) => {
              const d = new Date(`${e['start_date']}T12:00:00`);
              return (
                <li key={e['id']} className="flex items-center gap-3">
                  <div className="grid w-12 shrink-0 place-items-center rounded-lg border border-white/10 py-1.5">
                    <span className="font-mono text-[9.5px] text-org-accent uppercase">
                      {d.toLocaleDateString(undefined, { month: "short" })}
                    </span>
                    <span className="font-display tabular text-lg leading-none font-bold text-graphite">
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-graphite">{e['name']}</p>
                    <p className="truncate text-xs text-steel">
                      {[e['event_type'], e['venue'] || e['city'], e['state']].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-steel">
            <CalendarDays className="size-4" /> Nothing on the calendar yet.
          </p>
        )}
      </div>
    </Panel>
  );
}

function shortDate(v: unknown) {
  const s = String(v ?? "");
  if (!s) return "";
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

void Copy;
