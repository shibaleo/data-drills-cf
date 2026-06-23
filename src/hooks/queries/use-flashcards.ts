import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rpc, unwrap, type RpcData } from "@/lib/rpc-client";
import type { FlashcardCreateInput, FlashcardUpdateInput } from "@/lib/schemas/flashcard";

export type FlashcardRow = RpcData<typeof rpc.api.v1.flashcards.$get>["data"][number];
export type FlashcardReviewRow = RpcData<typeof rpc.api.v1["flashcard-reviews"]["$get"]>["data"][number];
export type TopicItem = RpcData<typeof rpc.api.v1.fields[":id"]["topics"]["$get"]>["data"][number];

export const flashcardsKeys = {
  all: ["flashcards"] as const,
  cards: (fieldId: string) => [...flashcardsKeys.all, "cards", fieldId] as const,
  reviews: () => [...flashcardsKeys.all, "reviews"] as const,
  topics: (fieldId: string) => ["flashcards", "topics", fieldId] as const,
};

export function useFlashcardsData(fieldId: string | undefined) {
  const cards = useQuery({
    queryKey: fieldId ? flashcardsKeys.cards(fieldId) : flashcardsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.flashcards.$get({ query: { field_id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
    meta: { persist: true },
  });
  const reviews = useQuery({
    queryKey: flashcardsKeys.reviews(),
    queryFn: async () => {
      const json = await unwrap(rpc.api.v1["flashcard-reviews"].$get({ query: {} }));
      return json.data;
    },
    enabled: !!fieldId,
    meta: { persist: true },
  });
  const topics = useQuery({
    queryKey: fieldId ? flashcardsKeys.topics(fieldId) : flashcardsKeys.all,
    queryFn: async () => {
      const json = await unwrap(
        rpc.api.v1.fields[":id"].topics.$get({ param: { id: fieldId! } }),
      );
      return json.data;
    },
    enabled: !!fieldId,
    staleTime: 5 * 60_000,
  });
  return {
    cards: cards.data ?? [],
    reviews: reviews.data ?? [],
    topics: topics.data ?? [],
    isLoading: cards.isLoading || reviews.isLoading || topics.isLoading,
  };
}

export function useCreateFlashcard(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FlashcardCreateInput) =>
      unwrap(rpc.api.v1.flashcards.$post({ json: payload })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(fieldId) });
    },
  });
}

export function useUpdateFlashcard(fieldId: string | undefined) {
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
      if (fieldId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(fieldId) });
    },
  });
}

export function useDeleteFlashcard(fieldId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(rpc.api.v1.flashcards[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      if (fieldId) qc.invalidateQueries({ queryKey: flashcardsKeys.cards(fieldId) });
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
