"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useMasterField } from "@/hooks/use-master-field";
import { MasterFieldPicker } from "@/components/master-field-picker";
import {
  useSubjectsList,
  useCreateSubject,
  useUpdateSubject,
  useDeleteSubject,
  useReorderSubjects,
} from "@/hooks/queries/use-subjects";

export default function SubjectsPage() {
  const { field } = useMasterField();
  const fieldId = field?.id;
  const { data: subjects = [], isLoading } = useSubjectsList(fieldId);
  const create = useCreateSubject(fieldId);
  const update = useUpdateSubject(fieldId);
  const remove = useDeleteSubject(fieldId);
  const reorder = useReorderSubjects(fieldId);

  if (!field) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <MasterFieldPicker />
        <div className="text-center py-12 text-muted-foreground">Select a field</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="px-4 md:px-6 pt-3"><MasterFieldPicker /></div>
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
    </div>
  );
}
