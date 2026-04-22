"use client";

import { ProjectMasterPage } from "@/components/shared/project-master-page";

export default function TopicsPage() {
  return (
    <ProjectMasterPage
      makeConfig={(projectId) => ({
        title: "Topics",
        endpoint: `/projects/${projectId}/topics`,
        entityName: "Topic",
        hasColor: true,
      })}
    />
  );
}
