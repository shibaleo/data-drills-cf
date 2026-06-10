"use client";

/**
 * /review — canonical scope.id への redirect 専用。
 *
 * Plan A 後: detail page は /review/<canonical_scope.id> で直接ホストされる。
 * このエントリページは bookmarks (旧 /review?scope_id=<id>) と localStorage 由来の
 * 「前回開いていた scope」へのリダイレクトのみを担う。scope 未指定なら /scopes へ。
 */

import { useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { usePageTitle } from "@/lib/page-context";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function ReviewEntryPage() {
  usePageTitle("Review");
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const navigate = useNavigate();

  useEffect(() => {
    const target = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (target) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/review/$scope_id" as string, params: { scope_id: target }, replace: true });
    } else {
      navigate({ to: "/scopes" as string, replace: true });
    }
  }, [search.scope_id, navigate]);

  return <div className="p-4 text-muted-foreground text-sm">Redirecting…</div>;
}
