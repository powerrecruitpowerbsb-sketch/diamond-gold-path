import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { RosterRow } from "@/components/profile/Composition";

type SortKey = "name" | "position" | "class_year" | "bats" | "hometown" | "home_state" | "transfer";

const CLASS_ORDER = ["FR", "SO", "JR", "SR", "GR"];

const blank = <span className="text-[11px] text-steel/80 italic">Not published</span>;

/** Dense reference table under the composition. Sortable, 38px rows. */
export function RosterTable({ rows }: { rows: RosterRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const value = (row: RosterRow, key: SortKey): string | number => {
    switch (key) {
      case "class_year":
        return CLASS_ORDER.indexOf(String(row.class_year ?? "")) + 1 || 99;
      case "bats":
        return `${row.bats ?? "~"}${row.throws ?? "~"}`;
      case "transfer":
        return row.is_juco_transfer ? 0 : row.is_transfer ? 1 : 2;
      case "position":
        return row.position ?? "~";
      case "hometown":
        return row.hometown ?? "~";
      case "home_state":
        return row.home_state ?? "~";
      default:
        return row.name ?? "";
    }
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = value(a, sort.key);
      const bv = value(b, sort.key);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv)) * sort.dir;
    });
    return copy;
  }, [rows, sort]);

  const columns: { key: SortKey; header: string; numeric?: boolean }[] = [
    { key: "name", header: "Player" },
    { key: "position", header: "Pos" },
    { key: "class_year", header: "Class" },
    { key: "bats", header: "B / T" },
    { key: "hometown", header: "Hometown" },
    { key: "home_state", header: "State" },
    { key: "transfer", header: "Transfer" },
  ];

  const toggle = (key: SortKey) =>
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );

  return (
    <div className="overflow-x-auto rounded border border-border bg-card">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className="px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase"
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className="inline-flex items-center gap-1 hover:text-org-primary"
                >
                  {column.header}
                  {sort.key === column.key ? (
                    sort.dir === 1 ? (
                      <ArrowUp className="size-3" aria-hidden />
                    ) : (
                      <ArrowDown className="size-3" aria-hidden />
                    )
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={row.id}
              className={cn("border-b border-border last:border-0 hover:bg-muted/50")}
            >
              <td className="h-[38px] px-3 py-1.5 align-middle font-semibold text-graphite">
                {row.name}
              </td>
              <td className="h-[38px] px-3 py-1.5 align-middle text-graphite">
                {row.position ? (row.position === "TWO_WAY" ? "Two-way" : row.position) : blank}
              </td>
              <td className="tabular h-[38px] px-3 py-1.5 align-middle text-graphite">
                {row.class_year ?? blank}
              </td>
              <td className="tabular h-[38px] px-3 py-1.5 align-middle text-graphite">
                {row.bats || row.throws ? `${row.bats ?? "–"} / ${row.throws ?? "–"}` : blank}
              </td>
              <td className="h-[38px] px-3 py-1.5 align-middle text-steel">
                {row.hometown ?? blank}
              </td>
              <td className="h-[38px] px-3 py-1.5 align-middle text-steel">
                {row.home_state ?? row.home_country ?? blank}
              </td>
              <td className="h-[38px] px-3 py-1.5 align-middle text-steel">
                {row.is_juco_transfer
                  ? "JUCO transfer"
                  : row.is_transfer
                    ? "Transfer"
                    : index >= 0
                      ? "—"
                      : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
