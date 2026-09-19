import type { ReactNode } from "react";
import { BadgeCheck, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { dateLabel, hostOf, stateLabel } from "@/lib/profile-fields";
import type { VerifiedField } from "@/components/profile/DataLayers";

/**
 * The school page's own presentation layer.
 *
 * Same facts, same honesty about what is and isn't known — but read as a
 * recruiting page rather than an audit spreadsheet. Sources stay on every
 * field; they just stop shouting.
 */

/** A headline figure. Verified figures carry the green seal, nothing else does. */
export function StatCard({
  label,
  value,
  hint,
  verified = false,
  className,
}: {
  label: string;
  value: string;
  hint?: string | null;
  verified?: boolean;
  className?: string;
}) {
  const known = value && !/^not /i.test(value);
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-4",
        verified && known && "border-diamond-green/30 bg-diamond-green-tint",
        className,
      )}
    >
      <p className="meta">{label.toUpperCase()}</p>
      <p
        className={cn(
          "tabular mt-1.5 font-display text-2xl leading-none font-bold",
          known ? "text-graphite" : "text-steel/70 text-base font-normal italic",
        )}
      >
        {value}
      </p>
      {hint ? <p className="meta mt-2 truncate">{hint}</p> : null}
      {verified && known ? (
        <BadgeCheck
          className="absolute top-3 right-3 size-4 text-diamond-green"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/** A titled panel — the page's one container shape. */
export function Panel({
  title,
  meta,
  children,
  className,
}: {
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-display text-base font-bold text-graphite">{title}</h2>
          {meta ? <div className="meta">{meta}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Verified fields as a readable two-column list. The value leads; the source
 * and last-verified date sit underneath in small mono, available but quiet.
 */
export function FactList({
  fields,
  columns = 2,
}: {
  fields: VerifiedField[];
  columns?: 1 | 2;
}) {
  return (
    <dl className={cn("grid gap-x-8", columns === 2 ? "sm:grid-cols-2" : "")}>
      {fields.map((field) => {
        const known = field.state.kind === "value";
        const host = hostOf(field.sourceUrl);
        const verified = dateLabel(field.verifiedAt);
        return (
          <div
            key={field.label}
            className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-0"
          >
            <dt className="text-sm text-steel">
              {field.label}
              {field.note ? <span className="meta mt-0.5 block">{field.note}</span> : null}
            </dt>
            <dd className="min-w-0 text-right">
              <span
                className={cn(
                  "tabular text-sm font-semibold",
                  known ? "text-graphite" : "text-steel/70 font-normal italic",
                )}
              >
                {stateLabel(field.state)}
              </span>
              <span className="meta mt-0.5 block truncate">
                {host && field.sourceUrl ? (
                  <a
                    href={field.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-org-primary"
                  >
                    {host}
                  </a>
                ) : (
                  <span className="text-steel/60">No source on file</span>
                )}
                {verified ? <> · {verified}</> : null}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Sticky in-page navigation across the school page's chapters. */
export function ProfileTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; count?: number | null }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="sticky top-0 z-20 -mx-4 mb-6 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={cn(
                "touch-target relative px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                on ? "text-org-primary" : "text-steel hover:text-graphite",
              )}
            >
              {tab.label}
              {tab.count !== null && tab.count !== undefined ? (
                <span className="tabular ml-1.5 text-xs text-steel">{tab.count}</span>
              ) : null}
              {on ? (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-org-primary" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** A quiet external address row. */
export function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 py-2.5 last:border-0">
      <span className="text-sm text-steel">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sm font-semibold text-org-primary hover:underline"
      >
        {hostOf(url)}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}
