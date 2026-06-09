"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import { useField } from "@/hooks/use-field";
import {
  useLevelsList,
  useCreateLevel,
  useUpdateLevel,
  useDeleteLevel,
  useReorderLevels,
} from "@/hooks/queries/use-levels";

export default function LevelsPage() {
  const { currentField } = useField();
  const fieldId = currentField?.id;
  const { data: levels = [], isLoading } = useLevelsList(fieldId);
  const create = useCreateLevel(fieldId);
  const update = useUpdateLevel(fieldId);
  const remove = useDeleteLevel(fieldId);
  const reorder = useReorderLevels(fieldId);

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
