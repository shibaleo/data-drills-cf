"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  useFields,
  useStatuses,
  useInvalidateFieldData,
  type Field,
  type LookupItem,
  type StatusItem,
} from "@/hooks/queries/use-field-data";

export type { StatusItem };

interface FieldContextValue {
  fields: Field[];
  refresh: () => Promise<void>;
  statuses: StatusItem[];
  /** "前回見た scope" メモリ。URL に scope_id を持たないページ用。 */
  currentScopeId: string | null;
  setCurrentScopeId: (id: string | null) => void;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useField() {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error("useField must be used within FieldProvider");
  return ctx;
}

/**
 * Lookup helpers for level/subject by id. subject/level lists are passed in
 * because they are per-field state and no longer live in context.
 */
export function useLookup(subjects: LookupItem[], levels: LookupItem[]) {
  const ctx = useContext(FieldContext);
  const statuses = ctx?.statuses ?? [];

  function levelName(id: string) { return levels.find((l) => l.id === id)?.name ?? ''; }
  function levelColor(id: string) { return levels.find((l) => l.id === id)?.color ?? ''; }
  function subjectName(id: string) { return subjects.find((s) => s.id === id)?.name ?? ''; }
  function subjectColor(id: string) { return subjects.find((s) => s.id === id)?.color ?? ''; }
  function statusColor(name: string) { return statuses.find((s) => s.name === name)?.color ?? null; }
  function statusStability(name: string) { return statuses.find((s) => s.name === name)?.stabilityDays ?? 0; }

  return { levelName, levelColor, subjectName, subjectColor, statusColor, statusStability };
}

const SCOPE_STORAGE_KEY = "dd_current_scope_id";
const LEGACY_FIELD_STORAGE_KEY = "dd_current_field";

export function FieldProvider({ children }: { children: ReactNode }) {
  const [currentScopeId, setCurrentScopeIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(SCOPE_STORAGE_KEY) : null,
  );

  const fieldsQuery = useFields();
  const statusesQuery = useStatuses();
  const invalidate = useInvalidateFieldData();

  const fields = fieldsQuery.data ?? [];

  // One-time cleanup of legacy localStorage key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LEGACY_FIELD_STORAGE_KEY) !== null) {
      localStorage.removeItem(LEGACY_FIELD_STORAGE_KEY);
    }
  }, []);

  const setCurrentScopeId = useCallback((id: string | null) => {
    setCurrentScopeIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(SCOPE_STORAGE_KEY, id);
      else localStorage.removeItem(SCOPE_STORAGE_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    invalidate();
  }, [invalidate]);

  const value = useMemo<FieldContextValue>(() => ({
    fields,
    refresh,
    statuses: statusesQuery.data ?? [],
    currentScopeId,
    setCurrentScopeId,
  }), [fields, refresh, statusesQuery.data, currentScopeId, setCurrentScopeId]);

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}
