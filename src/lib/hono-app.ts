import { Hono } from "hono";
import { logger } from "hono/logger";
import { authenticate, type AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };
import health from "@/routes/health";
import problems from "@/routes/problems";
import answers from "@/routes/answers";
import flashcards from "@/routes/flashcards";
import flashcardReviews from "@/routes/flashcard-reviews";
import reviews from "@/routes/reviews";
import apiKeys from "@/routes/api-keys";
import users from "@/routes/users";
import statuses from "@/routes/statuses";
import reviewTags from "@/routes/review-tags";
import problemFiles from "@/routes/problem-files";
import problemsList from "@/routes/problems-list";
import srs from "@/routes/srs";
import answerHistory from "@/routes/answer-history";
import pdfExport from "@/routes/pdf-export";
import filterPrefs from "@/routes/filter-prefs";
import googleAuth from "@/routes/google-auth";
import drive from "@/routes/drive";
import toggl from "@/routes/toggl";
import sleep from "@/routes/sleep";
import exercise from "@/routes/exercise";
import leisure from "@/routes/leisure";
// Phase 6: 新エンティティ routes (旧 projects/tags/backlog は廃止済)
import fields from "@/routes/fields";
import reviewTypes from "@/routes/review-types";
import scopes from "@/routes/scopes";
import habits from "@/routes/habits";
import habitCategories from "@/routes/habit-categories";
import habitFresh from "@/routes/habit-fresh";
import warehouse from "@/routes/warehouse";

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
  .route("/problems", problems)
  .route("/answers", answers)
  .route("/flashcards", flashcards)
  .route("/flashcard-reviews", flashcardReviews)
  .route("/reviews", reviews)
  .route("/api-keys", apiKeys)
  .route("/users", users)
  .route("/statuses", statuses)
  .route("/review-tags", reviewTags)
  .route("/problem-files", problemFiles)
  .route("/problems-list", problemsList)
  .route("/srs", srs)
  .route("/answer-history", answerHistory)
  .route("/pdf-export", pdfExport)
  .route("/filter-prefs", filterPrefs)
  .route("/toggl", toggl)
  .route("/sleep", sleep)
  .route("/exercise", exercise)
  .route("/leisure", leisure)
  // Phase 6: 新エンティティ
  .route("/fields", fields)
  .route("/review-types", reviewTypes)
  .route("/scopes", scopes)
  .route("/habits", habits)
  .route("/habit-categories", habitCategories)
  .route("/habit-fresh", habitFresh)
  .route("/warehouse", warehouse)
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
