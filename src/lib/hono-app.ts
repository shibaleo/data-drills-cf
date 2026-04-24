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
import authRoutes from "@/routes/auth";
import statuses from "@/routes/statuses";
import tags from "@/routes/tags";
import reviewTags from "@/routes/review-tags";
import problemFiles from "@/routes/problem-files";
import problemsList from "@/routes/problems-list";
import answersList from "@/routes/answers-list";
import schedule from "@/routes/schedule";
import notes from "@/routes/notes";
import pdfExport from "@/routes/pdf-export";
import googleAuth from "@/routes/google-auth";
import drive from "@/routes/drive";

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
    return c.json({ error: msg }, 500);
  })
  // Public routes (before auth middleware)
  .route("/health", health)
  .route("/auth", authRoutes)
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
  .route("/answers-list", answersList)
  .route("/schedule", schedule)
  .route("/notes", notes)
  .route("/pdf-export", pdfExport)
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
