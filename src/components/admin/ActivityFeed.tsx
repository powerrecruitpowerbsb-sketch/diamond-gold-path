import { useState } from "react";
import { ChevronDown } from "lucide-react";

import {
  dayBucket,
  initials,
  relativeTime,
  toActivityEntries,
  valueLabel,
  type ActivityEntry,
  type AuditRow,
} from "@/lib/audit-format";

type Props = {
  rows: AuditRow[];
  emptyLabel?: string;
};

export function ActivityFeed({ rows, emptyLabel = "No changes recorded yet." }: Props) {
  const entries = toActivityEntries(rows ?? []);

  if (!entries.length) {
    return <p className="text-sm text-steel">{emptyLabel}</p>;
  }

  const buckets: { label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayBucket(entry.createdAt);
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else buckets.push({ label, entries: [entry] });
  }

  return (
    <div className="grid gap-4">
      {buckets.map((bucket) => (
        <section key={bucket.label} className="grid gap-1">
          <h3 className="meta text-steel">{bucket.label}</h3>
          <ul className="divide-y divide-border">
            {bucket.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const expandable = entry.changes.length > 1;

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-org-primary/10 text-[11px] font-bold text-org-primary"
        >
          {initials(entry.actorLabel)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-graphite">
            <span className="font-semibold">{entry.actorLabel}</span> {entry.sentence}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {entry.transition ? (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-semibold text-steel">
                  {entry.transition.from}
                </span>
                <span aria-hidden className="text-steel">
                  →
                </span>
                <span className="rounded-md bg-diamond-green-tint px-1.5 py-0.5 font-semibold text-diamond-green">
                  {entry.transition.to}
                </span>
              </span>
            ) : null}
            {expandable ? (
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex items-center gap-1 text-xs font-semibold text-org-primary hover:underline"
                aria-expanded={open}
              >
                {open ? "Hide details" : `Show ${entry.changes.length} changes`}
                <ChevronDown
                  className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            ) : null}
          </div>
          {open ? (
            <dl className="mt-2 grid gap-1 rounded-[10px] bg-muted/60 p-3">
              {entry.changes.map((change) => (
                <div key={change.field} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <dt className="font-semibold text-graphite capitalize">{change.fieldLabel}</dt>
                  <dd className="tabular text-steel">
                    {valueLabel(change.from)} → <span className="text-graphite">{valueLabel(change.to)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <time
          className="meta shrink-0 whitespace-nowrap"
          dateTime={entry.createdAt}
          title={new Date(entry.createdAt).toLocaleString()}
        >
          {relativeTime(entry.createdAt)}
        </time>
      </div>
    </li>
  );
}
