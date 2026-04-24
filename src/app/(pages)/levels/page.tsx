"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useProject } from "@/hooks/use-project";
import {
  useLevelsList,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  useReorderLevels,
} from "@/hooks/queries/use-levels";

export default function LevelsPage() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const { data: levels = [], isLoading } = useLevelsList(projectId);
  const create = useCreateLevel(projectId);
  const update = useUpdateLevel(projectId);
  const remove = useDeleteLevel(projectId);
  const reorder = useReorderLevels(projectId);

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  return (
    <MasterPageUI
      key={projectId}
      title="Levels"
      entityName="Level"
      hasColor
      items={levels}
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
