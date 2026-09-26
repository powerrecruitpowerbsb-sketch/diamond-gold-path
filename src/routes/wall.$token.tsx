import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Share2, Trophy } from "lucide-react";

import { getWall, type WallOfFame } from "@/lib/wall.functions";

export const Route = createFileRoute("/wall/$token")({
  loader: ({ params }) => getWall({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.org} — Wall of Fame` : "Wall of Fame";
    const description = loaderData
      ? `${loaderData.commits.length} ${loaderData.org} athletes committed to play college ball.`
      : "College commitments on Curve Recruit.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: () => <Unavailable />,
  notFoundComponent: () => <Unavailable />,
  component: WallPage,
});

function Unavailable() {
  return (
    <main className="grid min-h-screen place-items-center bg-chalk p-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-graphite">Wall not available</h1>
        <p className="mt-2 text-sm text-steel">This link was turned off or doesn't exist.</p>
      </div>
    </main>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

/** School logo from the athletics site's icon; lettermark if none loads. */
function SchoolLogo({ school, website }: { school: string; website: string | null }) {
  const host = hostOf(website);
  const [failed, setFailed] = useState(false);
  const initials = school
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w) && !["University", "College", "Of", "The"].includes(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
  if (host && !failed) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`}
        alt={`${school} logo`}
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          // The icon service returns a 16px globe when it has nothing.
          if ((e.target as HTMLImageElement).naturalWidth < 32) setFailed(true);
        }}
        className="size-20 object-contain drop-shadow"
      />
    );
  }
  return (
    <span className="font-display grid size-20 place-items-center rounded-full bg-org-primary text-2xl font-bold text-org-primary-foreground">
      {initials || school.charAt(0)}
    </span>
  );
}

function WallPage() {
  const wall = Route.useLoaderData();
  if (!wall) return <Unavailable />;
  return <Wall wall={wall} />;
}

function Wall({ wall }: { wall: WallOfFame }) {
  const style = {
    ...(wall.primary ? { "--org-primary": wall.primary } : {}),
    ...(wall.accent ? { "--org-accent": wall.accent } : {}),
  } as React.CSSProperties;
  const years = [...new Set(wall.commits.map((c) => c.gradYear))].sort(
    (a, b) => (b ?? 0) - (a ?? 0),
  );

  return (
    <main style={style} className="min-h-screen bg-chalk">
      <header className="stadium-gradient px-5 pt-10 pb-12 text-center sm:px-10">
        {wall.logoUrl ? (
          <img src={wall.logoUrl} alt={`${wall.org} logo`} className="mx-auto size-20 object-contain" />
        ) : (
          <Trophy className="mx-auto size-14 text-org-accent" aria-hidden />
        )}
        <p className="mt-4 font-mono text-[11px] tracking-[0.25em] text-org-accent uppercase">
          {wall.org}
        </p>
        <h1 className="font-display mt-2 text-4xl font-bold text-white sm:text-6xl">Wall of Fame</h1>
        <p className="mt-3 text-sm text-white/70">
          {wall.commits.length} athlete{wall.commits.length === 1 ? "" : "s"} committed to play college ball
        </p>
        <button
          type="button"
          onClick={async () => {
            const url = window.location.href;
            if (navigator.share) await navigator.share({ title: `${wall.org} Wall of Fame`, url }).catch(() => {});
            else await navigator.clipboard.writeText(url);
          }}
          className="touch-target mt-5 inline-flex items-center gap-2 rounded-xl bg-org-accent px-5 text-sm font-semibold text-org-accent-foreground"
        >
          <Share2 className="size-4" aria-hidden /> Share
        </button>
      </header>

      {wall.commits.length === 0 ? (
        <p className="p-10 text-center text-sm text-steel">Commitments will appear here.</p>
      ) : (
        <div className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
          {years.map((year) => (
            <section key={year ?? "none"}>
              <h2 className="font-display border-b border-border pb-2 text-2xl font-bold text-graphite">
                {year ? `Class of ${year}` : "Committed"}
              </h2>
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {wall.commits
                  .filter((c) => c.gradYear === year)
                  .map((c, i) => {
                    const inner = (
                      <>
                        <div className="flex items-center justify-center bg-gradient-to-b from-org-primary/10 to-transparent py-6">
                          <SchoolLogo school={c.school} website={c.website} />
                        </div>
                        <div className="flex items-center gap-3 border-t border-border p-4">
                          {c.hasPhoto && c.slug ? (
                            <img
                              src={`/api/public/athlete-photo/${c.slug}`}
                              alt=""
                              className="size-12 shrink-0 rounded-full object-cover"
                            />
                          ) : null}
                          <div className="min-w-0">
                            <p className="font-display truncate text-lg leading-tight font-bold text-graphite">
                              {c.name}
                            </p>
                            <p className="truncate text-sm font-semibold text-org-primary">{c.school}</p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-steel uppercase">
                              {[c.position, c.division, c.conference].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </>
                    );
                    return (
                      <li
                        key={`${c.name}-${i}`}
                        className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_14px_-10px_rgba(18,35,58,0.4)]"
                      >
                        {c.slug ? (
                          <a href={`/p/${c.slug}`} className="block">
                            {inner}
                          </a>
                        ) : (
                          inner
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <footer className="pb-10 text-center font-mono text-[11px] text-steel">Powered by Curve Recruit</footer>
    </main>
  );
}
