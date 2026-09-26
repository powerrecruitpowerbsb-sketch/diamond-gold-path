import type { ComponentPropsWithoutRef } from "react";

import { allStates, stateName } from "@/lib/regions";

/** A US state picker that stores the two-letter code. */
export function StateSelect({
  value,
  onValueChange,
  className,
  ...rest
}: {
  value: string;
  onValueChange: (code: string) => void;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"select">, "value" | "onChange">) {
  return (
    <select
      value={(value ?? "").toUpperCase()}
      onChange={(e) => onValueChange(e.target.value)}
      className={className}
      {...rest}
    >
      <option value="">Choose a state</option>
      {allStates().map((code) => (
        <option key={code} value={code}>
          {stateName(code) ?? code}
        </option>
      ))}
    </select>
  );
}

export const POSITIONS = ["RHP", "LHP", "C", "1B", "2B", "SS", "3B", "OF", "INF", "UTL"] as const;

export function gradYearOptions(): number[] {
  const y = new Date().getFullYear();
  return Array.from({ length: 9 }, (_, i) => y - 1 + i);
}
