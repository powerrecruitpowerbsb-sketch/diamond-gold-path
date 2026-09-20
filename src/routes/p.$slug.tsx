import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Mail, MapPin, Phone, PlayCircle } from "lucide-react";

import { formatHeight, formatMetric, metricLabel, metricSourceLabel } from "@/lib/athlete-metrics";
import { getScoutCard } from "@/lib/athlete-profile.functions";

/**
 * The public scout card. A coach opens the link from an email with no account
 * and sees exactly what the athlete's people chose to share — nothing else.
 */
export const Route = createFileRoute("/p/$slug")({
  loader: ({ params }) => getScoutCard({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const athlete = (loaderData as any)?.athlete ?? null;
    const name = athlete?.name ? String(athlete.name) : "Recruiting profile";
    const bits = [
      athlete?.grad_year ? `Class of ${athlete.grad_year}` : null,
      athlete?.primary_position ?? null,
      athlete?.high_school ?? null,
    ].filter(Boolean);
    const title = `${name} — recruiting profile`;
    const description = bits.length
      ? `${name}: ${bits.join(" · ")}. Measurables, academics, video and upcoming events.`
      : "Verified measurables, academics, video and upcoming events for a college recruit.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <Missing />,
  notFoundComponent: () => <Missing />,
  component: ScoutCard,
});

function Missing() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-foreground">This profile is not shared</h1>
      <p className="mt-2 text-sm text-steel">
        The link may have been turned off, or the address is slightly different. Ask the player or
        their club for a fresh link.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-org-primary-strong">
        Power Recruit
      </Link>
    </main>
  );
}

const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="surface-raised rounded-2xl p-5 sm:p-6">
      {title ? (
        <h2 className="font-display mb-4 text-base font-bold tracking-tight text-foreground">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-graphite">{value}</dd>
    </div>
  );
}

/** A single headline measurable, big enough to read on a phone at a ballpark. */
function MetricTile({ metric }: { metric: Record<string, any> }) {
  const key = String(metric["metric_key"]);
  return (
    <div className="rounded-xl border border-border bg-surface-2 px-4 py-3">
      <p className={LABEL}>{metricLabel(key)}</p>
      <p className="font-display tabular mt-1 text-2xl font-bold text-foreground">
        {formatMetric(metric["value"], key)}
      </p>
      <p className="meta mt-1 normal-case">
        {[
          metricSourceLabel(String(metric["source"] ?? "manual")),
          metric["recorded_on"] ? String(metric["recorded_on"]) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

function ContactButton({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="touch-target flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-org-accent"
    >
      <Icon className="size-4 shrink-0 text-org-accent-strong" aria-hidden />
      <span className="min-w-0">
        <span className={`${LABEL} block`}>{label}</span>
        <span className="block truncate text-sm font-semibold text-graphite">{value}</span>
      </span>
    </a>
  );
}

function ScoutCard() {
  const card = Route.useLoaderData() as Record<string, any> | null;
  const { slug } = Route.useParams();
  if (!card?.["athlete"]) return <Missing />;

  const a = card["athlete"] as Record<string, any>;
  const org = (card["organization"] ?? null) as Record<string, any> | null;
  const metrics = (card["metrics"] ?? []) as Record<string, any>[];
  const events = (card["events"] ?? []) as Record<string, any>[];
  const videos = (a["video_links"] ?? []) as string[];

  const hometown = [a["home_city"], a["home_state"]].filter(Boolean).join(", ");
  const sport = String(a["sport"] ?? "baseball");
  const positions = [a["primary_position"], a["secondary_position"]].filter(Boolean);

  // The club's own colors light the header, exactly as they do inside the app.
  const brandStyle = {
    ...(org?.["brand_primary_color"] ? { "--org-primary": org["brand_primary_color"] } : {}),
    ...(org?.["brand_accent_color"] ? { "--org-accent": org["brand_accent_color"] } : {}),
  } as React.CSSProperties;

  return (
    <main className="min-h-screen bg-background pb-16" style={brandStyle}>
      <header className="stadium-gradient relative overflow-hidden">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex min-w-0 items-start gap-5">
              {/* The player's picture, or the club's mark when none is on file. */}
              <div className="size-28 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/10 sm:size-32">
                {a["photo_path"] ? (
                  <img
                    src={`/api/public/athlete-photo/${slug}`}
                    alt={`${String(a["name"])} photo`}
                    className="size-full object-cover"
                  />
                ) : org?.["logo_url"] ? (
                  <img
                    src={String(org["logo_url"])}
                    alt={`${String(org["name"] ?? "Club")} logo`}
                    className="size-full object-contain p-3"
                  />
                ) : (
                  <span className="font-display grid size-full place-items-center text-3xl font-bold text-white/80">
                    {String(a["name"] ?? "")
                      .split(" ")
                      .map((part) => part.charAt(0))
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                )}
              </div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.18em] text-org-accent uppercase">
                {sport === "softball" ? "Softball" : "Baseball"} recruit
                {a["grad_year"] ? ` · Class of ${a["grad_year"]}` : ""}
              </p>
              <h1 className="font-display mt-2 text-[2.25rem] leading-[1.05] font-bold text-white sm:text-5xl">
                {String(a["name"])}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {positions.map((position) => (
                  <span
                    key={String(position)}
                    className="rounded-md bg-white/12 px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase"
                  >
                    {String(position)}
                  </span>
                ))}
                {a["bats"] || a["throws"] ? (
                  <span className="rounded-md border border-white/25 px-2.5 py-1 font-mono text-xs text-white/85">
                    B/T {String(a["bats"] ?? "–")}/{String(a["throws"] ?? "–")}
                  </span>
                ) : null}
                {a["height_inches"] || a["weight_lbs"] ? (
                  <span className="rounded-md border border-white/25 px-2.5 py-1 font-mono text-xs text-white/85">
                    {[
                      a["height_inches"] ? formatHeight(Number(a["height_inches"])) : null,
                      a["weight_lbs"] ? `${a["weight_lbs"]} lb` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </div>
              {hometown || a["high_school"] ? (
                <p className="mt-4 flex items-center gap-1.5 text-sm text-white/75">
                  <MapPin className="size-4" aria-hidden />
                  {[a["high_school"], hometown].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <SocialLinks
                twitter={a["twitter_handle"]}
                instagram={a["instagram_handle"]}
                className="mt-4"
              />
            </div>
            </div>

            {org?.["name"] ? (
              <div className="text-right">
                <p className="font-mono text-[11px] tracking-[0.18em] text-white/55 uppercase">
                  Club
                </p>
                <p className="font-display text-lg font-bold text-white">{String(org["name"])}</p>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
        {metrics.length ? (
          <Panel title="Measurables">
            <div className="grid gap-3 sm:grid-cols-3">
              {metrics.map((metric) => (
                <MetricTile key={String(metric["metric_key"])} metric={metric} />
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="Academics & eligibility">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Fact label="GPA" value={a["gpa"] ? String(a["gpa"]) : null} />
            <Fact label="SAT" value={a["sat_score"] ? String(a["sat_score"]) : null} />
            <Fact label="ACT" value={a["act_score"] ? String(a["act_score"]) : null} />
            <Fact
              label="NCAA eligibility ID"
              value={a["eligibility_id"] ? String(a["eligibility_id"]) : null}
            />
            <Fact label="High school" value={a["high_school"] ? String(a["high_school"]) : null} />
            <Fact label="Club team" value={a["club_team"] ? String(a["club_team"]) : null} />
            <Fact label="Hometown" value={hometown || null} />
          </dl>
        </Panel>

        {videos.length ? (
          <Panel title="Video">
            <ul className="grid gap-3 sm:grid-cols-2">
              {videos.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 transition-colors hover:border-org-accent"
                  >
                    <PlayCircle className="size-5 shrink-0 text-org-accent-strong" aria-hidden />
                    <span className="min-w-0 truncate text-sm font-semibold text-graphite">
                      {link.replace(/^https?:\/\//, "")}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {events.length ? (
          <Panel title="Where to see this player">
            <ul className="space-y-2">
              {events.map((event, index) => (
                <li
                  key={`${String(event["name"])}-${index}`}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3"
                >
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-org-accent-strong" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-graphite">{String(event["name"])}</p>
                    <p className="meta mt-0.5 normal-case">
                      {[
                        String(event["start_date"]),
                        event["end_date"] && event["end_date"] !== event["start_date"]
                          ? `– ${String(event["end_date"])}`
                          : null,
                        event["venue"] ? String(event["venue"]) : null,
                        [event["city"], event["state"]].filter(Boolean).join(", ") || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {a["athlete_email"] || a["athlete_phone"] || a["parent_email"] || a["parent_phone"] ? (
          <Panel title="Contact">
            <div className="grid gap-3 sm:grid-cols-2">
              {a["athlete_email"] ? (
                <ContactButton
                  icon={Mail}
                  label="Player email"
                  value={String(a["athlete_email"])}
                  href={`mailto:${String(a["athlete_email"])}`}
                />
              ) : null}
              {a["athlete_phone"] ? (
                <ContactButton
                  icon={Phone}
                  label="Player phone"
                  value={String(a["athlete_phone"])}
                  href={`tel:${String(a["athlete_phone"])}`}
                />
              ) : null}
              {a["parent_email"] ? (
                <ContactButton
                  icon={Mail}
                  label={a["parent_name"] ? `${String(a["parent_name"])} — email` : "Parent email"}
                  value={String(a["parent_email"])}
                  href={`mailto:${String(a["parent_email"])}`}
                />
              ) : null}
              {a["parent_phone"] ? (
                <ContactButton
                  icon={Phone}
                  label={a["parent_name"] ? `${String(a["parent_name"])} — phone` : "Parent phone"}
                  value={String(a["parent_phone"])}
                  href={`tel:${String(a["parent_phone"])}`}
                />
              ) : null}
            </div>
            <SocialLinks
              twitter={a["twitter_handle"]}
              instagram={a["instagram_handle"]}
              className="mt-4"
            />

          </Panel>
        ) : null}

        <p className="meta pt-2 text-center normal-case">
          Shared by {org?.["name"] ? String(org["name"]) : "the player's club"} · Power Recruit
        </p>
      </div>
    </main>
  );
}
