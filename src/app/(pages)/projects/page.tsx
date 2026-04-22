"use client";

import { MasterPage } from "@/components/shared/master-page";

export default function ProjectsPage() {
  return (
    <MasterPage
      config={{
        title: "Projects",
        endpoint: "/projects",
        entityName: "Project",
      }}
    />
  );
}
