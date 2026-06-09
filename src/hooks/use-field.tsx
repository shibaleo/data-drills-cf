"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  useFields,
  useSubjects,
  useLevels,
  useStatuses,
  useInvalidateFieldData,
  type Field,
  type LookupItem,
  type StatusItem,
} from "@/hooks/queries/use-field-data";

export type { StatusItem };

interface FieldContextValue {
  fields: Field[];
  currentField: Field | null;
  setCurrentField: (f: Field) => void;
  refresh: () => Promise<void>;
  subjects: LookupItem[];
  levels: LookupItem[];
  statuses: StatusItem[];
  filterSubjectId: string | null;
  setFilterSubjectId: (id: string | null) => void;
  filterLevelId: string | null;
  setFilterLevelId: (id: string | null) => void;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useField() {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error("useField must be used within FieldProvider");
  return ctx;
}

/** Lookup helpers for level/subject by id (same API as LD) */
export function useLookup() {
  const ctx = useContext(FieldContext);
  const subjects = ctx?.subjects ?? [];
  const levels = ctx?.levels ?? [];
  const statuses = ctx?.statuses ?? [];

  function levelName(id: string) { return levels.find((l) => l.id === id)?.name ?? ''; }
  function levelColor(id: string) { return levels.find((l) => l.id === id)?.color ?? ''; }
  function subjectName(id: string) { return subjects.find((s) => s.id === id)?.name ?? ''; }
  function subjectColor(id: string) { return subjects.find((s) => s.id === id)?.color ?? ''; }
  function statusColor(name: string) { return statuses.find((s) => s.name === name)?.color ?? null; }
  function statusStability(name: string) { return statuses.find((s) => s.name === name)?.stabilityDays ?? 0; }

  return { levelName, levelColor, subjectName, subjectColor, statusColor, statusStability };
}

const STORAGE_KEY = "dd_current_field";

export function FieldProvider({ children }: { children: ReactNode }) {
  const [currentField, setCurrentFieldState] = useState<Field | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);

  const fieldsQuery = useFields();
  const subjectsQuery = useSubjects(currentField?.id);
  const levelsQuery = useLevels(currentField?.id);
  const statusesQuery = useStatuses();
  const invalidate = useInvalidateFieldData();

  const fields = fieldsQuery.data ?? [];

  // Pick initial field from localStorage once the list loads
  useEffect(() => {
    if (currentField || fields.length === 0) return;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const saved = savedId ? fields.find((f) => f.id === savedId) : null;
    setCurrentFieldState(saved ?? fields[0]);
  }, [fields, currentField]);

  const setCurrentField = useCallback((f: Field) => {
    setCurrentFieldState(f);
    setFilterSubjectId(null);
    setFilterLevelId(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, f.id);
    }
  }, []);

  const refresh = useCallback(async () => {
    invalidate();
  }, [invalidate]);

  const value = useMemo<FieldContextValue>(() => ({
    fields,
    currentField,
    setCurrentField,
    refresh,
    subjects: subjectsQuery.data ?? [],
    levels: levelsQuery.data ?? [],
    statuses: statusesQuery.data ?? [],
    filterSubjectId,
    setFilterSubjectId,
    filterLevelId,
    setFilterLevelId,
  }), [
    fields,
    currentField,
    setCurrentField,
    refresh,
    subjectsQuery.data,
    levelsQuery.data,
    statusesQuery.data,
    filterSubjectId,
    filterLevelId,
  ]);

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}
