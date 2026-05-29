/**
 * Lightweight sortable column header — for manual tables (not TanStack-Table).
 * 親が `{ key, dir } | null` の state を保持し、ヘッダクリックで toggle する。
 */
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

export function SimpleSortHeader({
  label, sortKey, state, setState,
}: {
  label: React.ReactNode;
  sortKey: string;
  state: SortState;
  setState: (s: SortState) => void;
}) {
  const active = state?.key === sortKey;
  const dir = active ? state!.dir : null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!active) setState({ key: sortKey, dir: "asc" });
        else if (dir === "asc") setState({ key: sortKey, dir: "desc" });
        else setState(null);
      }}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {dir === "asc" ? <ArrowUp className="size-3"/>
        : dir === "desc" ? <ArrowDown className="size-3"/>
        : <ArrowUpDown className="size-3 opacity-30"/>}
    </button>
  );
}

/** 行配列をソート (state が null なら元の順序を維持)。 */
export function applySort<T>(
  rows: T[],
  state: SortState,
  accessors: Record<string, (r: T) => string | number | null | undefined>,
): T[] {
  if (!state) return rows;
  const acc = accessors[state.key];
  if (!acc) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = acc(a);
    const bv = acc(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv));
  });
  if (state.dir === "desc") sorted.reverse();
  return sorted;
}
