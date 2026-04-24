import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { NoteUpdateInput } from "@/lib/schemas/note";

export type NoteRow = RpcData<typeof rpc.api.v1.notes.$get>["data"][number];

export const notesKeys = {
  all: ["notes"] as const,
  list: (projectId: string) => [...notesKeys.all, "list", projectId] as const,
};

export function useNotesList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? notesKeys.list(projectId) : notesKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.notes.$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateNote(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { title?: string; content?: string; topic_id?: string | null }) => {
      const json = await unwrap(
        rpc.api.v1.notes.$post({
          json: {
            project_id: projectId!,
            title: payload.title ?? "Untitled",
            content: payload.content ?? "",
            topic_id: payload.topic_id,
          },
        }),
      );
      return json;
    },
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: notesKeys.list(projectId) });
    },
  });
}

export function useUpdateNote(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: NoteUpdateInput }) =>
      unwrap(
        rpc.api.v1.notes[":id"].$put({
          param: { id: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: notesKeys.list(projectId) });
    },
  });
}

export function useDeleteNote(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.notes[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: notesKeys.list(projectId) });
    },
  });
}

export function useReorderNotes(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(rpc.api.v1.notes.reorder.$patch({ json: { ids } })),
    onMutate: async (ids) => {
      if (!projectId) return;
      const key = notesKeys.list(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NoteRow[]>(key);
      if (previous) {
        const indexMap = new Map(ids.map((id, i) => [id, i]));
        qc.setQueryData(
          key,
          [...previous].sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (!projectId || !ctx?.previous) return;
      qc.setQueryData(notesKeys.list(projectId), ctx.previous);
    },
    onSettled: () => {
      if (projectId) qc.invalidateQueries({ queryKey: notesKeys.list(projectId) });
    },
  });
}
