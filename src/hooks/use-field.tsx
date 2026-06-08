"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  useFields,
  useSubjects,
  useLevels,
  useStatuses,
  useInvalidateFieldData,
  type Project,
  type LookupItem,
  type StatusItem,
} from "@/hooks/queries/use-field-data";

export type { StatusItem };

interface FieldContextValue {
  projects: Project[];
  currentField: Project | null;
  setCurrentProject: (p: Project) => void;
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

const STORAGE_KEY = "dd_current_project";

export function FieldProvider({ children }: { children: ReactNode }) {
  const [currentField, setCurrentProjectState] = useState<Project | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);

  const projectsQuery = useFields();
  const subjectsQuery = useSubjects(currentField?.id);
  const levelsQuery = useLevels(currentField?.id);
  const statusesQuery = useStatuses();
  const invalidate = useInvalidateFieldData();

  const projects = projectsQuery.data ?? [];

  // Pick initial project from localStorage once the list loads
  useEffect(() => {
    if (currentField || projects.length === 0) return;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const saved = savedId ? projects.find((p) => p.id === savedId) : null;
    setCurrentProjectState(saved ?? projects[0]);
  }, [projects, currentField]);

  const setCurrentProject = useCallback((p: Project) => {
    setCurrentProjectState(p);
    setFilterSubjectId(null);
    setFilterLevelId(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, p.id);
    }
  }, []);

  const refresh = useCallback(async () => {
    invalidate();
  }, [invalidate]);

  const value = useMemo<FieldContextValue>(() => ({
    projects,
    currentField,
    setCurrentProject,
    refresh,
    subjects: subjectsQuery.data ?? [],
    levels: levelsQuery.data ?? [],
    statuses: statusesQuery.data ?? [],
    filterSubjectId,
    setFilterSubjectId,
    filterLevelId,
    setFilterLevelId,
  }), [
    projects,
    currentField,
    setCurrentProject,
    refresh,
    subjectsQuery.data,
    levelsQuery.data,
    statusesQuery.data,
    filterSubjectId,
    filterLevelId,
  ]);

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>;
}
