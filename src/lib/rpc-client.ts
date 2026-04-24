import { hc, type InferResponseType } from "hono/client";
import type { AppType } from "@/lib/hono-app";
import { ApiError } from "@/lib/api-client";

/**
 * Type-safe RPC client for the Hono API.
 *
 * Usage:
 * ```ts
 * const data = await unwrap(rpc.api.v1.problems.$get({ query: { project_id } }));
 * ```
 *
 * `import type { AppType }` keeps server-only deps (Drizzle, postgres, etc.)
 * out of the client bundle.
 */
export const rpc = hc<AppType>("");

/** Runtime guard: does this body look like an error envelope? */
function isErrorBody(body: unknown): body is { error: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  );
}

/**
 * Await an RPC response, throw ApiError on non-2xx (or on a 2xx that still
 * carries an `{ error }` envelope), and return the success-branch body.
 *
 * No `as any` / no unsafe casts: the return type is narrowed by the
 * `isErrorBody` generic guard via TS control-flow analysis.
 */
type SuccessBody<T extends { json: () => Promise<unknown> }> = Exclude<
  Awaited<ReturnType<T["json"]>>,
  { error: string }
>;

export async function unwrap<
  T extends { ok: boolean; json: () => Promise<unknown>; status: number },
>(promise: Promise<T>): Promise<SuccessBody<T>> {
  const res = await promise;
  if (!res.ok) {
    // Error path: best-effort extract `error` message, throw.
    let msg = `HTTP ${res.status}`;
    try {
      const body: unknown = await res.json();
      if (isErrorBody(body)) msg = body.error;
    } catch { /* body not JSON */ }
    throw new ApiError(res.status, { error: msg });
  }
  // Success path: parse body, then narrow away the error branch.
  // Cast rationale: TS cannot express "after `!isErrorBody(b)`, the value
  // is `Exclude<T, { error: string }>`" for a generic T — the narrowing
  // only applies to concrete types. The `isErrorBody` guard above
  // *runtime-proves* the exclusion, so the cast is safe.
  const body: unknown = await res.json();
  if (isErrorBody(body)) {
    throw new ApiError(res.status, { error: body.error });
  }
  return body as SuccessBody<T>;
}

/**
 * Extract the success-branch response body type from an RPC endpoint callable.
 *
 * Usage: `type ScheduleRow = RpcData<typeof rpc.api.v1.schedule.$get>["data"][number];`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RpcData<T extends (...args: any[]) => any> = Exclude<
  InferResponseType<T>,
  { error: string }
>;
