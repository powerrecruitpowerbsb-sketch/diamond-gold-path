import { Link } from "@tanstack/react-router";
import { Columns3, X } from "lucide-react";

import { useCompare } from "@/components/compare/compare-selection";

/**
 * Persistent compare tray: bottom bar above the mobile tab bar,
 * bottom-right card on desktop. Compare unlocks at 2 selections.
 */
export function CompareTray() {
  const { selected, ids, remove, clear, max } = useCompare();
  if (selected.length === 0) return null;

  const ready = selected.length >= 2;

  return (
    <div className="fixed bottom-[76px] left-0 z-40 w-full px-3 min-[680px]:bottom-5 min-[680px]:left-auto min-[680px]:right-5 min-[680px]:w-auto min-[680px]:px-0">
      <div className="rounded-xl border border-border bg-card p-3 shadow-[0_18px_44px_-18px_rgba(18,35,58,0.55)] min-[680px]:max-w-md">
        <div className="flex items-center justify-between gap-3">
          <p className="meta text-org-primary">
            <span className="tabular">{selected.length}</span> of {max} selected
          </p>
          <button
            type="button"
            onClick={clear}
            className="text-xs font-semibold text-steel hover:text-seam-red"
          >
            Clear
          </button>
        </div>

        <ul className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-1.5 rounded-md bg-muted py-1 pr-1 pl-2 text-xs font-semibold text-graphite"
            >
              <span className="max-w-[150px] truncate">{entry.name}</span>
              <button
                type="button"
                onClick={() => remove(entry.id)}
                aria-label={`Remove ${entry.name} from comparison`}
                className="grid size-5 place-items-center rounded text-steel hover:bg-card hover:text-seam-red"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3">
          {ready ? (
            <Link
              to="/compare"
              search={{ ids: ids.join(",") }}
              className="touch-target flex w-full items-center justify-center gap-2 rounded-lg bg-seam-red text-sm font-semibold text-white hover:bg-seam-red/90"
            >
              <Columns3 className="size-4" aria-hidden />
              Compare {selected.length} schools
            </Link>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2.5 text-center text-xs text-steel">
              Select one more school to compare.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
