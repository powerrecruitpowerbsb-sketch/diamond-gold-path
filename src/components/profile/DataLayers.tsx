import type { ReactNode } from "react";
import { BadgeCheck, Lightbulb, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { dateLabel, hostOf, stateLabel, type FieldState } from "@/lib/profile-fields";

/** A titled profile section. Hairline rule, no card, no shadow. */
export function Section({
  id,
  title,
  meta,
  children,
  className,
}: {
  id?: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mt-8", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="font-display text-lg font-bold text-graphite">{title}</h2>
        {meta ? <p className="meta tabular">{meta}</p> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Layer badge: sourced fact, our judgment, or staff opinion. */
export function LayerTag({ layer }: { layer: "verified" | "classification" | "intelligence" }) {
  if (layer === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-diamond-green-tint px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-diamond-green uppercase">
        <BadgeCheck className="size-3" strokeWidth={2.5} aria-hidden />
        Verified data
      </span>
    );
  }
  if (layer === "classification") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-steel uppercase">
        <Scale className="size-3" strokeWidth={2.5} aria-hidden />
        Our classification
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded bg-seam-red-tint px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-seam-red uppercase">
      <Lightbulb className="size-3" strokeWidth={2.5} aria-hidden />
      Our intelligence
    </span>
  );
}

export type VerifiedField = {
  label: string;
  state: FieldState;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  note?: string | null;
};

/**
 * Verified Data table: green left edge, one row per field, with the source
 * address and last-verified date sitting on the row itself.
 */
export function VerifiedFieldTable({ fields }: { fields: VerifiedField[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border border-l-2 border-l-diamond-green bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-[38%] px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase">
              Field
            </th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase">
              Value
            </th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase">
              Source · verified
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const known = field.state.kind === "value";
            const host = hostOf(field.sourceUrl);
            const verified = dateLabel(field.verifiedAt);
            return (
              <tr key={field.label} className="border-b border-border last:border-0">
                <td className="h-[38px] px-3 py-1.5 align-middle text-steel">{field.label}</td>
                <td
                  className={cn(
                    "tabular h-[38px] px-3 py-1.5 align-middle font-semibold",
                    known ? "text-diamond-green" : "text-steel/80 font-normal italic",
                  )}
                >
                  {stateLabel(field.state)}
                  {field.note ? (
                    <span className="ml-2 text-xs font-normal text-steel not-italic">
                      {field.note}
                    </span>
                  ) : null}
                </td>
                <td className="h-[38px] px-3 py-1.5 align-middle text-xs text-steel">
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
                    <span className="text-steel/70">No source on file</span>
                  )}
                  {verified ? <> · {verified}</> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Our Classification: neutral, labelled as judgment, evidence shown when held. */
export function ClassificationTable({
  rows,
}: {
  rows: { label: string; value: string | null; evidence?: string | null; staffSet?: boolean }[];
}) {
  if (!rows.length) {
    return <p className="py-4 text-sm text-steel">No classifications recorded for this school.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-border border-l-2 border-l-steel bg-card">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="h-[38px] w-[38%] px-3 py-1.5 align-middle text-steel">{row.label}</td>
              <td className="px-3 py-1.5 align-middle text-graphite">
                <span className="font-semibold">{row.value ?? "Not classified"}</span>
                <span className="ml-2 text-xs text-steel">
                  {row.staffSet ? "Power staff judgment" : "Power judgment"}
                </span>
                {row.evidence ? (
                  <span className="mt-0.5 block text-xs text-steel">Evidence: {row.evidence}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type IntelRow = {
  id: string;
  label: string;
  body: string;
  /** Who may see this record: shown to staff only. */
  visibility?: "org_only" | "shared_with_families";
  attribution?: string | null;
};

/** Our Intelligence: red, in its own block, never mixed with sourced fact. */
export function IntelligencePanel({
  rows,
  emptyText = "Recruiting intelligence for this program hasn’t been written yet.",
  showVisibility = false,
  onShare,
}: {
  rows: IntelRow[];
  emptyText?: string;
  showVisibility?: boolean;
  onShare?: (row: IntelRow) => void;
}) {
  if (!rows.length) {
    return <p className="py-4 text-sm text-steel">{emptyText}</p>;
  }
  return (
    <div className="rounded border border-border border-l-2 border-l-seam-red bg-seam-red-tint p-4">
      <p className="meta text-seam-red">Staff opinion — interpretation, not sourced fact.</p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id}>
            <dt className="meta flex flex-wrap items-center gap-2 text-seam-red">
              {row.label.toUpperCase()}
              {showVisibility ? (
                <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold text-steel">
                  {row.visibility === "shared_with_families" ? "SHARED WITH FAMILIES" : "STAFF ONLY"}
                </span>
              ) : null}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-graphite">{row.body}</dd>
            {row.attribution ? <dd className="meta mt-1">{row.attribution}</dd> : null}
            {showVisibility && onShare && row.visibility === "org_only" ? (
              <dd className="mt-1">
                <button
                  type="button"
                  onClick={() => onShare(row)}
                  className="text-[11px] font-semibold text-org-primary underline decoration-dotted underline-offset-2"
                >
                  Share with families
                </button>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Staff-only material, in its own clearly marked internal block. */
export function InternalIntelPanel({
  rows,
  onShare,
}: {
  rows: IntelRow[];
  onShare?: (row: IntelRow) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="mt-4 rounded border border-border border-l-2 border-l-graphite bg-muted p-4">
      <p className="meta text-graphite">
        Internal — never shown to families. Evidence behind the conclusions above.
      </p>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id}>
            <dt className="meta text-graphite">{row.label.toUpperCase()}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-graphite">{row.body}</dd>
            {row.attribution ? <dd className="meta mt-1">{row.attribution}</dd> : null}
            {onShare ? (
              <dd className="mt-1">
                <button
                  type="button"
                  onClick={() => onShare(row)}
                  className="text-[11px] font-semibold text-org-primary underline decoration-dotted underline-offset-2"
                >
                  Share with families
                </button>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

