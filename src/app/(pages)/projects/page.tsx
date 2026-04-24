"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useReorderProjects,
} from "@/hooks/queries/use-project-data";

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const reorder = useReorderProjects();

  return (
    <MasterPageUI
      title="Projects"
      entityName="Project"
      items={projects}
      loading={isLoading}
      onCreate={(p: MasterSavePayload) =>
        create.mutateAsync({ code: p.code, name: p.name, color: p.color ?? null })
      }
      onUpdate={(id, p: MasterSavePayload) =>
        update.mutateAsync({ id, payload: { code: p.code, name: p.name, color: p.color ?? null } })
      }
      onDelete={(id) => remove.mutateAsync(id)}
      onReorder={(ids) => reorder.mutateAsync(ids)}
    />
  );
}
