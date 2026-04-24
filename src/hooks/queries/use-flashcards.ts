import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { FlashcardCreateInput, FlashcardUpdateInput } from "@/lib/schemas/flashcard";

export type FlashcardRow = RpcData<typeof rpc.api.v1.flashcards.$get>["data"][number];
export type FlashcardReviewRow = RpcData<typeof rpc.api.v1["flashcard-reviews"]["$get"]>["data"][number];
export type TopicItem = RpcData<typeof rpc.api.v1.projects[":id"]["topics"]["$get"]>["data"][number];

export const flashcardsKeys = {
  all: ["flashcards"] as const,
  cards: (projectId: string) => [...flashcardsKeys.all, "cards", projectId] as const,
  reviews: () => [...flashcardsKeys.all, "reviews"] as const,
  topics: (projectId: string) => ["flashcards", "topics", projectId] as const,
};

export function useFlashcardsData(projectId: string | undefined) {
  const cards = useQuery({
    queryKey: projectId ? flashcardsKeys.cards(projectId) : flashcardsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.flashcards.$get({ query: { project_id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
  });
  const reviews = useQuery({
    queryKey: flashcardsKeys.reviews(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["flashcard-reviews"].$get({ query: {} }));
      return json.data;
    },
    enabled: !!projectId,
  });
  const topics = useQuery({
    queryKey: projectId ? flashcardsKeys.topics(projectId) : flashcardsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.projects[":id"].topics.$get({ param: { id: projectId! } }),
      );
      return json.data;
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
  return {
    cards: cards.data ?? [],
    reviews: reviews.data ?? [],
    topics: topics.data ?? [],
    isLoading: cards.isLoading || reviews.isLoading || topics.isLoading,
  };
}

export function useCreateFlashcard(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FlashcardCreateInput) =>
      unwrap(rpc.api.v1.flashcards.$post({ json: payload })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(projectId) });
    },
  });
}

export function useUpdateFlashcard(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; payload: FlashcardUpdateInput }) =>
      unwrap(
        rpc.api.v1.flashcards[":id"].$put({
          param: { id: vars.id },
          json: vars.payload,
        }),
      ),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(projectId) });
    },
  });
}

export function useDeleteFlashcard(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.flashcards[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(projectId) });
    },
  });
}

export function useRateFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cardId: string; quality: number }) =>
      unwrap(
        rpc.api.v1.flashcards[":id"].reviews.$post({
          param: { id: vars.cardId },
          json: {
            quality: vars.quality,
            reviewed_at: new Date().toISOString(),
          },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: flashcardsKeys.reviews() }),
  });
}
