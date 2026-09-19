import { createFileRoute, Link } from "@tanstack/react-router";

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
      <h1 className="font-display text-2xl font-bold text-graphite">This profile is not shared</h1>
      <p className="mt-2 text-sm text-steel">
        The link may have been turned off, or the address is slightly different. Ask the player or
        their club for a fresh link.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-semibold text-org-primary">
        Power Recruit
      </Link>
    </main>
  );
}

const CARD = "rounded-lg border border-border bg-card p-5 shadow-sm";
const LABEL = "font-mono text-[11px] tracking-wide text-steel uppercase";

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-graphite">{value}</dd>
    </div>
  );
}

function ScoutCard() {
  const card = Route.useLoaderData() as Record<string, any> | null;
  if (!card?.['athlete']) return <Missing />;

  const a = card['athlete'] as Record<string, any>;
  const org = (card['organization'] ?? null) as Record<string, any> | null;
  const metrics = (card['metrics'] ?? []) as Record<string, any>[];
  const events = (card['events'] ?? []) as Record<string, any>[];
  const videos = (a['video_links'] ?? []) as string[];

  const hometown = [a['home_city'], a['home_state']].filter(Boolean).join(", ");
  const sport = String(a['sport'] ?? "baseball");

  return (
    <main className="min-h-screen bg-chalk pb-16">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-between gap-3 px-6 py-8">
          <div>
            <p className={LABEL}>
              {sport === "softball" ? "Softball" : "Baseball"} recruit
              {a['grad_year'] ? ` · Class of ${a['grad_year']}` : ""}
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold text-graphite">{String(a['name'])}</h1>
            <p className="mt-1 text-sm text-steel">
              {[a['primary_position'], a['secondary_position']].filter(Boolean).join(" / ")}
              {a['bats'] || a['throws']
                ? ` · B/T ${a['bats'] ?? "–"}/${a['throws'] ?? "–"}`
                : ""}
            </p>
          </div>
          {org?.['name'] ? (
            <div className="text-right">
              <p className={LABEL}>Club</p>
              <p className="text-sm font-semibold text-graphite">{String(org['name'])}</p>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
        <section className={CARD}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact
              label="Height"
              value={a['height_inches'] ? formatHeight(Number(a['height_inches'])) : null}
            />
            <Fact label="Weight" value={a['weight_lbs'] ? `${a['weight_lbs']} lb` : null} />
            <Fact label="High school" value={a['high_school'] ? String(a['high_school']) : null} />
            <Fact label="Club team" value={a['club_team'] ? String(a['club_team']) : null} />
            <Fact label="Hometown" value={hometown || null} />
            <Fact label="GPA" value={a['gpa'] ? String(a['gpa']) : null} />
            <Fact label="SAT" value={a['sat_score'] ? String(a['sat_score']) : null} />
            <Fact label="ACT" value={a['act_score'] ? String(a['act_score']) : null} />
            <Fact
              label="NCAA eligibility ID"
              value={a['eligibility_id'] ? String(a['eligibility_id']) : null}
            />
          </dl>
        </section>

        {metrics.length ? (
          <section className={CARD}>
            <h2 className="font-display text-base font-bold text-graphite">Measurables</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-border">
                {metrics.map((metric) => (
                  <tr key={String(metric['metric_key'])}>
                    <td className="py-1.5 text-graphite">{metricLabel(String(metric['metric_key']))}</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-graphite">
                      {formatMetric(metric['value'], String(metric['metric_key']))}
                    </td>
                    <td className="py-1.5 pl-4 text-right font-mono text-[11px] text-steel">
                      {[
                        metric['recorded_on'] ? String(metric['recorded_on']) : null,
                        metricSourceLabel(String(metric['source'] ?? "manual")),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {videos.length ? (
          <section className={CARD}>
            <h2 className="font-display text-base font-bold text-graphite">Video</h2>
            <ul className="mt-2 space-y-1.5">
              {videos.map((link) => (
                <li key={link}>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm font-semibold text-org-primary hover:underline"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {events.length ? (
          <section className={CARD}>
            <h2 className="font-display text-base font-bold text-graphite">Where to see this player</h2>
            <ul className="mt-2 divide-y divide-border">
              {events.map((event, index) => (
                <li key={`${String(event['name'])}-${index}`} className="py-2">
                  <p className="text-sm font-semibold text-graphite">{String(event['name'])}</p>
                  <p className="font-mono text-[11px] text-steel">
                    {[
                      String(event['start_date']),
                      event['end_date'] && event['end_date'] !== event['start_date']
                        ? `– ${String(event['end_date'])}`
                        : null,
                      event['venue'] ? String(event['venue']) : null,
                      [event['city'], event['state']].filter(Boolean).join(", ") || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {a['athlete_email'] || a['athlete_phone'] || a['parent_email'] || a['parent_phone'] ? (
          <section className={CARD}>
            <h2 className="font-display text-base font-bold text-graphite">Contact</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <Fact label="Player email" value={a['athlete_email'] ? String(a['athlete_email']) : null} />
              <Fact label="Player phone" value={a['athlete_phone'] ? String(a['athlete_phone']) : null} />
              <Fact
                label={a['parent_name'] ? String(a['parent_name']) : "Parent email"}
                value={a['parent_email'] ? String(a['parent_email']) : null}
              />
              <Fact label="Parent phone" value={a['parent_phone'] ? String(a['parent_phone']) : null} />
              <Fact
                label="X"
                value={a['twitter_handle'] ? `@${String(a['twitter_handle'])}` : null}
              />
              <Fact
                label="Instagram"
                value={a['instagram_handle'] ? `@${String(a['instagram_handle'])}` : null}
              />
            </dl>
          </section>
        ) : null}

        <p className="pt-2 text-center font-mono text-[11px] text-steel">
          Shared by {org?.['name'] ? String(org['name']) : "the player's club"} · Power Recruit
        </p>
      </div>
    </main>
  );
}
