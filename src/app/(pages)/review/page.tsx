"use client";

/**
 * /review — ?scope_id= 駆動の入口。
 *
 * 新メンタルモデル: 単一の canonical scope を 5 つの view (review/throughput/...)
 * で見るだけ。URL に ?scope_id=<canonicalId> が来たらその scope に対応する
 * review_scope に redirect する (= 移行期の bridge)。
 *
 * Phase 4 で review_scope 廃止後はこのページが detail UI を直接ホストする予定。
 */

import { useEffect } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useReviewScopesList } from "@/hooks/queries/use-review-scopes";
import { usePageTitle } from "@/lib/page-context";

const LAST_SCOPE_LS_KEY = "dd_last_scope_id";

export default function ReviewEntryPage() {
  usePageTitle("Review");
  const search = useSearch({ strict: false }) as { scope_id?: string };
  const navigate = useNavigate();
  const { data: reviewScopes = [], isLoading } = useReviewScopesList();

  // ?scope_id= が指定されたら、scope_id 一致の review_scope に飛ばす。
  // 未指定なら localStorage の前回値を試す。
  useEffect(() => {
    if (isLoading) return;
    const queryScopeId = search.scope_id
      ?? (typeof window !== "undefined" ? localStorage.getItem(LAST_SCOPE_LS_KEY) : null);
    if (!queryScopeId) return;
    const match = reviewScopes.find((rs) => rs.scope_id === queryScopeId);
    if (match) {
      if (search.scope_id && typeof window !== "undefined") {
        localStorage.setItem(LAST_SCOPE_LS_KEY, search.scope_id);
      }
      navigate({ to: "/review/$scope_id" as string, params: { scope_id: match.id }, replace: true });
    }
  }, [search.scope_id, reviewScopes, isLoading, navigate]);

  // Fallback: scope picker (= 移行期、明示的に scope を選ばせる)。
  return (
    <div className="p-3 md:p-4 flex flex-col gap-2">
      {isLoading && <div>Loading...</div>}
      <div className="text-xs text-muted-foreground mb-2">Select a scope to view its review:</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reviewScopes.map((s) => (
          <Link key={s.id} to="/review/$scope_id" params={{ scope_id: s.id }}
            className="block border rounded p-4 hover:bg-accent transition">
            <div className="font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-1">revision {s.revision}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
