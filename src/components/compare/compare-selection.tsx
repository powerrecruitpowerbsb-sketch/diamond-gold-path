import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { MAX_COMPARE } from "@/lib/compare.functions";

export type CompareEntry = { id: string; name: string; badge: string };

type CompareContextValue = {
  selected: CompareEntry[];
  ids: string[];
  isSelected: (id: string) => boolean;
  toggle: (entry: CompareEntry) => void;
  remove: (id: string) => void;
  clear: () => void;
  isFull: boolean;
  max: number;
};

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<CompareEntry[]>([]);

  const toggle = useCallback((entry: CompareEntry) => {
    setSelected((prev) => {
      if (prev.some((row) => row.id === entry.id)) return prev.filter((row) => row.id !== entry.id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, entry];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      selected,
      ids: selected.map((row) => row.id),
      isSelected: (id: string) => selected.some((row) => row.id === id),
      toggle,
      remove,
      clear,
      isFull: selected.length >= MAX_COMPARE,
      max: MAX_COMPARE,
    }),
    [selected, toggle, remove, clear],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) throw new Error("useCompare must be used inside CompareProvider");
  return context;
}
