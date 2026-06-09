"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useField } from "@/hooks/use-field";
import {
  useSubjectsList,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useReorderSubjects,
} from "@/hooks/queries/use-subjects";

export default function SubjectsPage() {
  const { currentField } = useField();
  const fieldId = currentField?.id;
  const { data: subjects = [], isLoading } = useSubjectsList(fieldId);
  const create = useCreateSubject(fieldId);
  const update = useUpdateSubject(fieldId);
  const remove = useDeleteSubject(fieldId);
  const reorder = useReorderSubjects(fieldId);

  if (!currentField) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  return (
    <MasterPageUI
      key={fieldId}
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
