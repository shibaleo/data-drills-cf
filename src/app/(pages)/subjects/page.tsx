"use client";

import { ProjectMasterPage } from "@/components/shared/project-master-page";

export default function SubjectsPage() {
  return (
    <ProjectMasterPage
      makeConfig={(projectId) => ({
        title: "Subjects",
        endpoint: `/projects/${projectId}/subjects`,
        entityName: "Subject",
        hasColor: true,
      })}
    />
  );
}
