"use client";

import { MasterPageUI, type MasterSavePayload } from "@/components/shared/master-list-ui";
import {
  useTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  useReorderTags,
} from "@/hooks/queries/use-tags";

export default function TagsPage() {
  const { data: tags = [], isLoading } = useTags();
  const create = useCreateTag();
  const update = useUpdateTag();
  const remove = useDeleteTag();
  const reorder = useReorderTags();

  return (
    <MasterPageUI
      title="Tags"
      entityName="Tag"
      hasColor
      items={tags}
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
