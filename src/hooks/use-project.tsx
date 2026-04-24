"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  useProjects,
  useSubjects,
  useLevels,
  useStatuses,
  useInvalidateProjectData,
  type Project,
  type LookupItem,
  type StatusItem,
} from "@/hooks/queries/use-project-data";

export type { StatusItem };

interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
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

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

/** Lookup helpers for level/subject by id (same API as LD) */
export function useLookup() {
  const ctx = useContext(ProjectContext);
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

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const subjectsQuery = useSubjects(currentProject?.id);
  const levelsQuery = useLevels(currentProject?.id);
  const statusesQuery = useStatuses();
  const invalidate = useInvalidateProjectData();

  const projects = projectsQuery.data ?? [];

  // Pick initial project from localStorage once the list loads
  useEffect(() => {
    if (currentProject || projects.length === 0) return;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const saved = savedId ? projects.find((p) => p.id === savedId) : null;
    setCurrentProjectState(saved ?? projects[0]);
  }, [projects, currentProject]);

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

  const value = useMemo<ProjectContextValue>(() => ({
    projects,
    currentProject,
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
    currentProject,
    setCurrentProject,
    refresh,
    subjectsQuery.data,
    levelsQuery.data,
    statusesQuery.data,
    filterSubjectId,
    filterLevelId,
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}
