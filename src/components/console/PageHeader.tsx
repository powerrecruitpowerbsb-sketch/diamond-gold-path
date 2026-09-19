import type { ReactNode } from "react";

import { HelpTip } from "@/components/brand/HelpTip";

/**
 * Every console screen opens the same way: a title line, one line of live
 * counts, and — behind a hover mark next to the title — the sentence that
 * explains the screen. No hero blocks, no stat-tile grids.
 */
export function PageHeader({
  title,
  description,
  counts,
  actions,
}: {
  title: string;
  description?: string;
  /** Short facts rendered as one muted line, joined with a middle dot. */
  counts?: (string | null | undefined)[];
  actions?: ReactNode;
}) {
  const line = (counts ?? []).filter((part): part is string => Boolean(part));

  return (
    <header className="mb-5 border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-graphite">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-steel">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {line.length ? <p className="meta tabular mt-2">{line.join(" · ")}</p> : null}
    </header>
  );
}

/** One line of muted text. An empty list never gets a card. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-sm text-steel">{children}</p>;
}

/** Number formatting used everywhere in the console. */
export function num(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}
