import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type Column<Row> = {
  /** 11px uppercase header label. */
  header: string;
  cell: (row: Row) => ReactNode;
  /** Right-align and tabular-figure the column. Use for every number. */
  numeric?: boolean;
  className?: string;
};

/**
 * The console's one list shape: 38px rows, hairline dividers, muted column
 * headers. Records are never rendered as a grid of cards.
 */
export function RecordTable<Row>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here.",
  caption,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  empty?: ReactNode;
  caption?: string;
}) {
  if (!rows.length) {
    return <p className="py-6 text-sm text-steel">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  "px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-steel uppercase",
                  column.numeric && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-border last:border-0 hover:bg-muted/50"
            >
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn(
                    "h-[38px] px-3 py-1.5 align-middle text-graphite",
                    column.numeric && "tabular text-right",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
