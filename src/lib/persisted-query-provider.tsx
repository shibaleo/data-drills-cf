/**
 * Persisted query provider — `meta.persist === true` を持つ query だけを localStorage
 * に永続化する。ページ再来訪時にキャッシュが復元されて即描画 (stale-while-revalidate)。
 *
 * 思想: SSR は per-user データの digest を build 時に焼き付けられない。代わりに
 * localStorage に「前回見たレスポンス」を残し、再来訪時に瞬時に表示して背景で
 * 更新する。最小実装として digest の `useDigestScope` のみ persist 対象にする。
 *
 * 安全装置:
 *  - buster = Clerk user.id → user 切替時にキャッシュ自動破棄
 *  - maxAge = 24h → 古すぎる cache は復元せず破棄
 *  - shouldDehydrateQuery で persist フラグ ON の query のみ書き出し
 */

import type { ReactNode } from "react";
import { useUser } from "@clerk/react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { queryClient } from "@/lib/query-client";

const persister = typeof window !== "undefined"
  ? createSyncStoragePersister({
      storage: window.localStorage,
      key: "dd-query-cache",
      throttleTime: 1000,
    })
  : undefined;

export function PersistedQueryProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();

  // user が未確定 (Clerk loading 中) はとりあえず "_loading" で persist。
  // sign-in 確定後は user.id に切り替わり、buster 変化で過去キャッシュは無効化される。
  const buster = isLoaded ? (user?.id ?? "_anon") : "_loading";

  if (!persister) {
    // SSR/non-browser fallback — そのまま children を返す。
    return <>{children}</>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60_000,
        buster,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => (q.meta as { persist?: boolean } | undefined)?.persist === true,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
