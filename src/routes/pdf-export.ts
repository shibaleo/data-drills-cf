/**
 * PDF Export — proxy to the PDF service for read-only combined PDF generation.
 *
 * Architecture (2026-06-10〜): cf-worker が DB から problem + file + subject + level
 * を join select して payload に同梱する。services/pdf は DB アクセスを持たず、
 * 受け取った gdrive_file_id / pages を Drive から DL → merge → 返すだけの
 * pure "PDF assembly" worker になる。schema drift が物理的に起きない。
 *
 * Dual-host (2026-06-11〜): プライマリは AWS Lambda (Function URL, AWS_IAM auth,
 * SigV4 署名)、フォールバックは Render free plan (x-pdf-service-key)。Lambda が
 * 5xx / network エラー / 設定欠落のいずれかなら Render に流す。両系統が同じ
 * pdf-core を bundle しているので API 契約は同一。
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { AwsClient } from "aws4fetch";
import { db } from "@/lib/db";
import { publicConfig } from "@/lib/public-config";
import { problem, problemFile, subject, level } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import type { AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

export const pdfExportInputSchema = z.object({
  // 100 件上限。Worker メモリ + Render free plan の処理時間を考慮。
  problem_ids: z.array(z.string().uuid()).min(1).max(100),
});

function readEnv(c: { env?: unknown }, key: string): string | undefined {
  const bag = (c.env ?? {}) as Record<string, unknown>;
  const fromBinding = bag[key];
  if (typeof fromBinding === "string" && fromBinding.length > 0) return fromBinding;
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  return fromProcess && fromProcess.length > 0 ? fromProcess : undefined;
}

type LambdaConfig = {
  invokeUrl: string;
  client: AwsClient;
};

/**
 * Read Lambda config if creds are present, else return null.
 *
 * 注: Function URL (lambda-url.*.on.aws) ではなく Lambda Invoke API
 * (lambda.{region}.amazonaws.com/2015-03-31/functions/{name}/invocations) を
 * 叩く。新規 AWS アカウントの Function URL 隠し block を回避するため
 * (詳細: docs/pdf-lambda-migration.md §8b)。
 */
function getLambdaConfig(c: { env?: unknown }): LambdaConfig | null {
  const functionName = readEnv(c, "PDF_LAMBDA_FUNCTION_NAME") ?? "pdf-export";
  const accessKeyId = readEnv(c, "PDF_LAMBDA_AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv(c, "PDF_LAMBDA_AWS_SECRET_ACCESS_KEY");
  const region = readEnv(c, "PDF_LAMBDA_AWS_REGION") ?? "ap-northeast-1";
  if (!accessKeyId || !secretAccessKey) return null;
  return {
    invokeUrl: `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${functionName}/invocations`,
    // Service omitted: aws4fetch auto-detects from URL host (lambda.* or s3.*).
    client: new AwsClient({ accessKeyId, secretAccessKey, region }),
  };
}

/** Invoke Lambda via the runtime API and unwrap the API-Gateway-v2 style response. */
async function invokeLambda(
  lambda: LambdaConfig,
  event: Record<string, unknown>,
): Promise<Response | null> {
  let res: Response | null = null;
  try {
    res = await lambda.client.fetch(lambda.invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (e) {
    console.log("[pdf-export] lambda fetch threw:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return null;
  }
  if (!res || !res.ok) return res;

  // Lambda Invoke API returns { statusCode, headers, body, isBase64Encoded }
  // as the JSON body when the function returned an API-Gateway-v2 response.
  // If the function threw, the body is { errorMessage, errorType, trace }.
  const payload = (await res.json().catch(() => null)) as
    | { statusCode?: number; headers?: Record<string, string>; body?: string; isBase64Encoded?: boolean; errorMessage?: string; errorType?: string }
    | null;
  if (!payload) {
    console.log("[pdf-export] lambda response not JSON");
    return null;
  }
  if (payload.errorMessage) {
    console.log("[pdf-export] lambda function error:", payload.errorType, payload.errorMessage);
    return null;
  }

  const status = payload.statusCode ?? 200;
  const headers = new Headers(payload.headers ?? {});
  const bodyText = payload.body ?? "";
  const body = payload.isBase64Encoded
    ? Uint8Array.from(atob(bodyText), (ch) => ch.charCodeAt(0))
    : bodyText;
  return new Response(body, { status, headers });
}

/** True when a fetch result is worth falling back on. */
function shouldFallback(res: Response | null): boolean {
  if (!res) return true; // network error
  if (res.status >= 500) return true;
  if (res.status === 429) return true; // Lambda throttle
  // 403 = Lambda 認可層拒否。SigV4 設定ズレ or AuthType ズレで起きる。
  // Lambda が機能してないのは確かなので Render に流す。
  if (res.status === 403) return true;
  return false;
}

const app = new Hono<Env>()
  /**
   * GET /health — proxy to the PDF service's /health endpoint.
   *
   * Render free plan は idle 後コールドスタートに ~60s かかる。Lambda 経路が
   * 使える限りそちらを先に試し、エラー時のみ Render に流す。
   */
  .get("/health", async (c) => {
    const lambda = getLambdaConfig(c);
    if (lambda) {
      const res = await invokeLambda(lambda, {
        version: "2.0",
        rawPath: "/health",
        requestContext: { http: { method: "GET", path: "/health" } },
        headers: {},
      });
      if (res && res.ok) return c.json({ ok: true, upstream: "lambda" });
    }

    const renderUrl = publicConfig.pdfApiUrl;
    if (!renderUrl) {
      return c.json({ error: "No PDF backend configured" }, 500);
    }
    const res = await fetch(`${renderUrl}/health`).catch(() => null);
    if (!res || !res.ok) {
      return c.json({ error: `PDF service unhealthy (${res?.status ?? "no response"})` }, 503);
    }
    return c.json({ ok: true, upstream: "render" });
  })
  .post("/", zValidator("json", pdfExportInputSchema), async (c) => {
    const { problem_ids } = c.req.valid("json");

    // 問題情報を 1 度の往復で join select。services/pdf 側に DB アクセスを
    // 一切残さないために、label 生成に必要な subject / level 名もここで解決する。
    const problems = await db
      .select({
        id: problem.id,
        code: problem.code,
        subjectId: problem.subjectId,
        levelId: problem.levelId,
      })
      .from(problem)
      .where(inArray(problem.id, problem_ids));
    const files = await db
      .select({
        problemId: problemFile.problemId,
        gdriveFileId: problemFile.gdriveFileId,
        problemPages: problemFile.problemPages,
      })
      .from(problemFile)
      .where(inArray(problemFile.problemId, problem_ids));

    const subjectIds = [...new Set(problems.map((p) => p.subjectId).filter((x): x is string => !!x))];
    const levelIds = [...new Set(problems.map((p) => p.levelId).filter((x): x is string => !!x))];
    const subjectMap = subjectIds.length === 0
      ? new Map<string, string>()
      : new Map((await db.select({ id: subject.id, name: subject.name }).from(subject).where(inArray(subject.id, subjectIds))).map((s) => [s.id, s.name]));
    const levelMap = levelIds.length === 0
      ? new Map<string, string>()
      : new Map((await db.select({ id: level.id, name: level.name }).from(level).where(inArray(level.id, levelIds))).map((l) => [l.id, l.name]));

    // code 昇順で順序を確定 (services/pdf 側でソートしなくていいように)
    problems.sort((a, b) => a.code.localeCompare(b.code));

    // 各問題の最初の file (= 主紙) を採用、無いものはスキップ。
    // pages が空の問題もスキップ (外部 import pipeline 側で page list を埋める前提)。
    const items = problems.flatMap((p) => {
      const pf = files.find((f) => f.problemId === p.id);
      if (!pf) return [];
      const pages = (pf.problemPages as number[] | null) ?? [];
      if (pages.length === 0) return [];
      const subName = (p.subjectId && subjectMap.get(p.subjectId)) || "";
      const lvlName = (p.levelId && levelMap.get(p.levelId)) || "";
      return [{
        label: `${subName}_${lvlName}_${p.code}`,
        gdrive_file_id: pf.gdriveFileId,
        pages,
      }];
    });

    if (items.length === 0) {
      return c.json({ error: "No problem pages found" }, 404);
    }

    const filenameStem = `exported-${new Date().toISOString().slice(0, 10)}`;
    const payload = JSON.stringify({ items, filename_stem: filenameStem });

    // ── Try Lambda first (if configured) ──
    let res: Response | null = null;
    let upstream: "lambda" | "render" | null = null;
    const lambda = getLambdaConfig(c);
    console.log("[pdf-export] lambda config:", lambda ? "present" : "missing");
    if (lambda) {
      // API Gateway v2 event payload — handler ([services/pdf-core])
      // routes /api/v1/pdf-sync/export to the export handler.
      // Render upstream は x-pdf-service-key 必須なので Lambda にも同じヘッダを
      // 渡して pdf-core 側で同じ apiKeyAuth() を通せるようにする。
      const renderKey = readEnv(c, "PDF_SERVICE_KEY") ?? "";
      res = await invokeLambda(lambda, {
        version: "2.0",
        rawPath: "/api/v1/pdf-sync/export",
        requestContext: { http: { method: "POST", path: "/api/v1/pdf-sync/export" } },
        headers: {
          "content-type": "application/json",
          "x-pdf-service-key": renderKey,
        },
        body: payload,
        isBase64Encoded: false,
      });
      console.log("[pdf-export] lambda response status:", res?.status ?? "null");
      if (!shouldFallback(res)) {
        upstream = "lambda";
      } else {
        const errText = await res?.clone().text().catch(() => "") ?? "(no body)";
        console.log("[pdf-export] lambda fallback triggered, error body:", errText.slice(0, 300));
      }
    }

    // ── Fallback to Render ──
    if (upstream !== "lambda") {
      const renderUrl = publicConfig.pdfApiUrl;
      const renderKey = readEnv(c, "PDF_SERVICE_KEY");
      if (!renderUrl || !renderKey) {
        return c.json({ error: "No usable PDF backend (Lambda failed and Render not configured)" }, 500);
      }
      res = await fetch(`${renderUrl}/api/v1/pdf-sync/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pdf-service-key": renderKey,
        },
        body: payload,
      }).catch(() => null);
      upstream = "render";
    }

    if (!res || !res.ok) {
      const errorText = await res?.text().catch(() => "") ?? "";
      return c.json(
        { error: errorText || `PDF service returned ${res?.status ?? "no response"}`, upstream },
        500,
      );
    }

    // ── Resolve PDF body ──
    // Lambda path: response is JSON { s3_key, content_type, content_disposition }
    //   → fetch from S3 with the SAME SigV4 client (cf-worker-pdf has s3:GetObject).
    // Render path: response body IS the PDF directly.
    let buffer: ArrayBuffer;
    let contentType: string;
    let contentDisposition: string;

    if (upstream === "lambda" && lambda) {
      const meta = (await res.json().catch(() => null)) as
        | { s3_key?: string; content_type?: string; content_disposition?: string }
        | null;
      if (!meta?.s3_key) {
        console.log("[pdf-export] lambda response missing s3_key, falling through to render is no longer possible at this point");
        return c.json({ error: "Lambda returned invalid response", upstream }, 500);
      }
      const bucket = readEnv(c, "PDF_S3_BUCKET") ?? "data-drills-pdf-export-shibaleo";
      const region = readEnv(c, "PDF_LAMBDA_AWS_REGION") ?? "ap-northeast-1";
      const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${meta.s3_key}`;
      const s3Res = await lambda.client.fetch(s3Url).catch((e) => {
        console.log("[pdf-export] s3 fetch threw:", e instanceof Error ? e.message : String(e));
        return null;
      });
      console.log("[pdf-export] s3 fetch status:", s3Res?.status ?? "null");
      if (!s3Res || !s3Res.ok) {
        return c.json({ error: "Failed to fetch PDF from S3", upstream }, 500);
      }
      buffer = await s3Res.arrayBuffer();
      contentType = meta.content_type ?? "application/pdf";
      contentDisposition = meta.content_disposition ?? `attachment; filename="${filenameStem}.pdf"`;
    } else {
      // Buffer the entire PDF in CF Worker before responding. Streaming
      // through with raw upstream headers caused intermittent client-side
      // failures (idle disconnects during Render cold-start, header/encoding
      // mismatches across browsers).
      buffer = await res.arrayBuffer();
      contentType = res.headers.get("content-type") ?? "application/pdf";
      contentDisposition =
        res.headers.get("content-disposition") ??
        `attachment; filename="${filenameStem}.pdf"`;
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
        "Content-Length": String(buffer.byteLength),
        "X-PDF-Upstream": upstream,
      },
    });
  });

export default app;
