"use client";

import { useProject } from "@/hooks/use-project";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectSelector() {
  const { projects, currentProject, setCurrentProject } = useProject();

  if (projects.length === 0) return null;

  return (
    <Select
      value={currentProject?.id ?? ""}
      onValueChange={(id) => {
        const p = projects.find((p) => p.id === id);
        if (p) setCurrentProject(p);
      }}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
