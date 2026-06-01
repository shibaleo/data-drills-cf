import { Hono } from "hono";
import { logger } from "hono/logger";
import { authenticate, type AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };
import health from "@/routes/health";
import projects from "@/routes/projects";
import problems from "@/routes/problems";
import answers from "@/routes/answers";
import flashcards from "@/routes/flashcards";
import flashcardReviews from "@/routes/flashcard-reviews";
import reviews from "@/routes/reviews";
import apiKeys from "@/routes/api-keys";
import users from "@/routes/users";
import statuses from "@/routes/statuses";
import tags from "@/routes/tags";
import reviewTags from "@/routes/review-tags";
import problemFiles from "@/routes/problem-files";
import problemsList from "@/routes/problems-list";
import review from "@/routes/review";
import throughput from "@/routes/throughput";
import pdfExport from "@/routes/pdf-export";
import backlog from "@/routes/backlog";
import reviewScopes from "@/routes/review-scopes";
import throughputScopes from "@/routes/throughput-scopes";
import statsScopes from "@/routes/stats-scopes";
import digestScopes from "@/routes/digest-scopes";
import filterPrefs from "@/routes/filter-prefs";
import googleAuth from "@/routes/google-auth";
import drive from "@/routes/drive";
import toggl from "@/routes/toggl";

/* ── V1 API sub-app ──
 *
 * Methods are chained so the accumulated route schema is preserved
 * in the app's type — required for Hono RPC (`hc<AppType>`).
 */

const v1 = new Hono<Env>()
  .use("*", logger())
  .onError((err, c) => {
    console.error(err);
    const causeMsg = err.cause instanceof Error ? err.cause.message : "";
    const msg = causeMsg ? `${err.message} - ${causeMsg}` : (err.message || "Internal Server Error");
    // CF Workers + Hyperdrive で間欠的に発生する postgres.js の接続断は entry 層で
    // 1 回 retry するため、ここで catch せずに throw する。
    if (causeMsg.includes("Network connection lost") || (err.message ?? "").includes("Network connection lost")) {
      throw err;
    }
    return c.json({ error: msg }, 500);
  })
  // Public routes (before auth middleware)
  .route("/health", health)
  // Auth middleware for all subsequent routes
  .use("*", async (c, next) => {
    const result = await authenticate(c.req.raw);
    if (!result) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("authResult", result);
    await next();
  })
  // Protected routes
  .route("/projects", projects)
  .route("/problems", problems)
  .route("/answers", answers)
  .route("/flashcards", flashcards)
  .route("/flashcard-reviews", flashcardReviews)
  .route("/reviews", reviews)
  .route("/api-keys", apiKeys)
  .route("/users", users)
  .route("/statuses", statuses)
  .route("/tags", tags)
  .route("/review-tags", reviewTags)
  .route("/problem-files", problemFiles)
  .route("/problems-list", problemsList)
  .route("/review", review)
  .route("/throughput", throughput)
  .route("/pdf-export", pdfExport)
  .route("/backlog", backlog)
  .route("/review-scopes", reviewScopes)
  .route("/throughput-scopes", throughputScopes)
  .route("/stats-scopes", statsScopes)
  .route("/digest-scopes", digestScopes)
  .route("/filter-prefs", filterPrefs)
  .route("/toggl", toggl)
  // /me endpoint — return authenticated user info
  .get("/me", (c) => {
    const authResult = c.get("authResult");
    return c.json({
      data: {
        id: authResult.userId,
        name: authResult.name,
        email: authResult.email,
      },
    });
  });

/* ── Root app — mounts V1 + Google/Drive routes ── */

const app = new Hono()
  .basePath("/api")
  .route("/v1", v1)
  .route("/auth/google", googleAuth)
  .route("/drive", drive);

export default app;

/** Type used by `hc<AppType>()` on the client to derive a type-safe RPC client. */
export type AppType = typeof app;
