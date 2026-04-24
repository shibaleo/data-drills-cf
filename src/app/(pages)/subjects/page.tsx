"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useProject } from "@/hooks/use-project";
import {
  useSubjectsList,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useReorderSubjects,
} from "@/hooks/queries/use-subjects";

export default function SubjectsPage() {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;
  const { data: subjects = [], isLoading } = useSubjectsList(projectId);
  const create = useCreateSubject(projectId);
  const update = useUpdateSubject(projectId);
  const remove = useDeleteSubject(projectId);
  const reorder = useReorderSubjects(projectId);

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
      title="Subjects"
      entityName="Subject"
      hasColor
      items={subjects}
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
