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
  url: string;
  client: AwsClient;
};

/** Read Lambda config if all four env vars are present, else return null. */
function getLambdaConfig(c: { env?: unknown }): LambdaConfig | null {
  const url = readEnv(c, "PDF_LAMBDA_URL");
  const accessKeyId = readEnv(c, "PDF_LAMBDA_AWS_ACCESS_KEY_ID");
  const secretAccessKey = readEnv(c, "PDF_LAMBDA_AWS_SECRET_ACCESS_KEY");
  const region = readEnv(c, "PDF_LAMBDA_AWS_REGION") ?? "ap-northeast-1";
  if (!url || !accessKeyId || !secretAccessKey) return null;
  return {
    url: url.replace(/\/$/, ""),
    client: new AwsClient({ accessKeyId, secretAccessKey, region, service: "lambda" }),
  };
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
      const res = await lambda.client
        .fetch(`${lambda.url}/health`)
        .catch(() => null);
      if (res && res.ok) return c.json({ ok: true, upstream: "lambda" });
    }

    const renderUrl = readEnv(c, "PDF_API_URL");
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
    if (lambda) {
      res = await lambda.client
        .fetch(`${lambda.url}/api/v1/pdf-sync/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        })
        .catch(() => null);
      if (!shouldFallback(res)) {
        upstream = "lambda";
      }
    }

    // ── Fallback to Render ──
    if (upstream !== "lambda") {
      const renderUrl = readEnv(c, "PDF_API_URL");
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

    // Buffer the entire PDF in CF Worker before responding. Streaming
    // through with raw upstream headers caused intermittent client-side
    // failures (idle disconnects during Render cold-start, header/encoding
    // mismatches across browsers).
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "application/pdf";
    const contentDisposition =
      res.headers.get("content-disposition") ??
      `attachment; filename="${filenameStem}.pdf"`;

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
