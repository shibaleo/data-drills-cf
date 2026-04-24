"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useProject } from "@/hooks/use-project";
import {
  useTopicsList,
  useCreateTopic,
  useUpdateTopic,
  useDeleteTopic,
  useReorderTopics,
} from "@/hooks/queries/use-topics";

export default function TopicsPage() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const { data: topics = [], isLoading } = useTopicsList(projectId);
  const create = useCreateTopic(projectId);
  const update = useUpdateTopic(projectId);
  const remove = useDeleteTopic(projectId);
  const reorder = useReorderTopics(projectId);

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
      title="Topics"
      entityName="Topic"
      hasColor
      items={topics}
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
