import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 永続化対象 query は localStorage に書き出すので gcTime も長めに。
      // 24h 設定にしておくとページ再来訪時の cache 復元 → 即描画 → 背景 refetch
      // のパターンが成立する。永続化対象は meta.persist=true の query のみ。
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
