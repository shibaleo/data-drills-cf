"use client";

import { useProject } from "@/hooks/use-project";
import { MasterPage, type MasterPageConfig } from "./master-page";

interface ProjectMasterPageProps {
  makeConfig: (projectId: string) => MasterPageConfig;
}

export function ProjectMasterPage({ makeConfig }: ProjectMasterPageProps) {
  const { currentProject } = useProject();

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">
          Please select a project
        </div>
      </div>
    );
  }

  return (
    <MasterPage
      key={currentProject.id}
      config={makeConfig(currentProject.id)}
    />
  );
}
