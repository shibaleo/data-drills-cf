"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import {
  useStatusesList,
  useCreateStatus,
  useUpdateStatus,
  useDeleteStatus,
  useReorderStatuses,
} from "@/hooks/queries/use-statuses";

export default function StatusesPage() {
  const { data: statuses = [], isLoading } = useStatusesList();
  const create = useCreateStatus();
  const update = useUpdateStatus();
  const remove = useDeleteStatus();
  const reorder = useReorderStatuses();

  return (
    <MasterPageUI
      title="Statuses"
      entityName="Status"
      hasColor
      items={statuses}
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
