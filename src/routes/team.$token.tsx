import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";

import { getTeamPacket } from "@/lib/team-packet.functions";
import { formatMetric, metricLabel } from "@/lib/athlete-metrics";

export const Route = createFileRoute("/team/$token")({
  loader: ({ params }) => getTeamPacket({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.org} ${loaderData.team} — Roster` : "Team roster";
    const description = loaderData
      ? `Roster sheet for ${loaderData.org} ${loaderData.team}: classes, positions and coach-verified numbers.`
      : "Team roster sheet on Curve Recruit.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  errorComponent: () => <Unavailable />,
  notFoundComponent: () => <Unavailable />,
  component: PacketPage,
});

function Unavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-chalk p-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-graphite">Roster not available</h1>
        <p className="mt-2 text-sm text-steel">This link was turned off or doesn't exist.</p>
      </div>
    </main>
  );
}

function feetInches(inches: number | null) {
  if (!inches) return null;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function PacketPage() {
  const packet = Route.useLoaderData();
  if (!packet) return <Unavailable />;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <main className="min-h-screen bg-chalk print:bg-card">
      <header className="stadium-gradient px-5 py-7 sm:px-10 print:bg-none print:py-2">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-org-accent uppercase print:text-steel">
              {[packet.org, packet.season].filter(Boolean).join(" · ")}
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl print:text-graphite">
              {packet.team}
              {packet.ageGroup ? <span className="ml-2 text-lg opacity-70">{packet.ageGroup}</span> : null}
            </h1>
            <p className="mt-1 text-sm text-white/70 print:text-steel">
              {packet.players.length} players · Green numbers are coach verified
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="touch-target inline-flex items-center gap-2 rounded-xl bg-card px-4 text-sm font-semibold text-graphite print:hidden"
          >
            <Printer className="size-4" aria-hidden /> Print
          </button>
        </div>
      </header>

      <ul className="mx-auto grid max-w-5xl gap-3 p-4 sm:grid-cols-2 sm:p-8 print:grid-cols-2 print:gap-2 print:p-0">
        {packet.players.map((p, i) => (
          <li
            key={`${p.name}-${i}`}
            className="flex gap-3 rounded-xl border border-border bg-card p-4 break-inside-avoid print:p-2"
          >
            <div className="font-display w-12 shrink-0 text-3xl font-bold text-org-primary tabular-nums">
              {p.jersey ? `#${p.jersey}` : "—"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg leading-tight font-bold text-graphite">{p.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-steel uppercase">
                {[
                  p.gradYear ? `Class of ${p.gradYear}` : null,
                  p.position,
                  p.bats || p.throws ? `${p.bats ?? "—"}/${p.throws ?? "—"}` : null,
                  feetInches(p.height),
                  p.weight ? `${p.weight} lb` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {p.metrics.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.metrics.slice(0, 6).map((m) => (
                    <span
                      key={m.key}
                      className="rounded-md border border-diamond-green/30 bg-diamond-green-tint px-1.5 py-0.5 text-[11px] font-semibold text-diamond-green"
                    >
                      {metricLabel(m.key)} {formatMetric(m.value, m.key)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {p.slug && origin ? (
              <a href={`/p/${p.slug}`} className="shrink-0" aria-label={`${p.name} scout card`}>
                <QRCodeSVG value={`${origin}/p/${p.slug}`} size={64} />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
