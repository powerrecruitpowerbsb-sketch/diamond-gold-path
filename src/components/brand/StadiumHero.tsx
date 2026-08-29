import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type HeroStat = { value: string; label: string };

export function StadiumHero({
  eyebrow,
  headline,
  subhead,
  stats = [],
  actions,
  className,
}: {
  eyebrow?: string;
  headline: ReactNode;
  subhead?: ReactNode;
  stats?: HeroStat[];
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "stadium-gradient relative overflow-hidden rounded-2xl px-6 py-14 sm:px-10 sm:py-20",
        className,
      )}
    >
      <div className="relative max-w-3xl">
        {eyebrow ? (
          <p className="mb-4 font-mono text-[11px] font-medium tracking-[0.18em] text-org-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[2.5rem] leading-[1.05] font-bold text-white sm:text-[3.5rem]">
          {headline}
        </h1>
        {subhead ? (
          <p className="mt-5 max-w-2xl text-base text-white/75 sm:text-lg">{subhead}</p>
        ) : null}
        {actions ? <div className="mt-8 flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      {stats.length > 0 ? (
        <dl className="relative mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/12 pt-8 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="meta text-white/55">{stat.label}</dt>
              <dd className="tabular font-display text-3xl font-bold text-white sm:text-4xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
