"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useMasterField } from "@/hooks/use-master-field";
import { MasterFieldPicker } from "@/components/master-field-picker";
import {
  useLevelsList,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  useReorderLevels,
} from "@/hooks/queries/use-levels";

export default function LevelsPage() {
  const { field } = useMasterField();
  const fieldId = field?.id;
  const { data: levels = [], isLoading } = useLevelsList(fieldId);
  const create = useCreateLevel(fieldId);
  const update = useUpdateLevel(fieldId);
  const remove = useDeleteLevel(fieldId);
  const reorder = useReorderLevels(fieldId);

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
    </div>
  );
}
