"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { fetchAllPages } from "@/lib/api-client";

interface Project {
  id: string;
  code: string;
  name: string;
}

interface LookupItem {
  id: string;
  name: string;
  color?: string | null;
  point?: number;
}

/** Full answer_status row from the API */
export interface StatusItem {
  id: string;
  name: string;
  color: string | null;
  point: number;
  sortOrder: number;
  stabilityDays: number;
  description: string | null;
}

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [subjects, setSubjects] = useState<LookupItem[]>([]);
  const [levels, setLevels] = useState<LookupItem[]>([]);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const [filterLevelId, setFilterLevelId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAllPages<Project>("/projects");
      setProjects(data);
      if (data.length > 0 && !currentProject) {
        const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const saved = savedId ? data.find((p) => p.id === savedId) : null;
        setCurrentProjectState(saved ?? data[0]);
      }
    } catch {
      // ignore
    }
  }, [currentProject]);

  useEffect(() => { refresh(); }, [refresh]);

  // Fetch subjects, levels, statuses when project changes
  useEffect(() => {
    if (!currentProject) return;
    Promise.all([
      fetchAllPages<LookupItem>(`/projects/${currentProject.id}/subjects`),
      fetchAllPages<LookupItem>(`/projects/${currentProject.id}/levels`),
      fetchAllPages<StatusItem>("/statuses"),
    ]).then(([subs, lvls, stats]) => {
      setSubjects(subs);
      setLevels(lvls);
      setStatuses(stats);
    }).catch(() => { /* ignore */ });
  }, [currentProject]);

  const setCurrentProject = useCallback((p: Project) => {
    setCurrentProjectState(p);
    setFilterSubjectId(null);
    setFilterLevelId(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, p.id);
    }
  }, []);

  return (
    <ProjectContext.Provider value={{ projects, currentProject, setCurrentProject, refresh, subjects, levels, statuses, filterSubjectId, setFilterSubjectId, filterLevelId, setFilterLevelId }}>
      {children}
    </ProjectContext.Provider>
  );
}
