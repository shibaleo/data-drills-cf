"use client";

import { ProjectMasterPage } from "@/components/shared/project-master-page";

export default function LevelsPage() {
  return (
    <ProjectMasterPage
      makeConfig={(projectId) => ({
        title: "Levels",
        endpoint: `/projects/${projectId}/levels`,
        entityName: "Level",
        hasColor: true,
      })}
    />
  );
}
