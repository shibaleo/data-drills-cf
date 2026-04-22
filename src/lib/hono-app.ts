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
import pdfSync from "@/routes/pdf-sync";
import googleAuth from "@/routes/google-auth";
import drive from "@/routes/drive";

/* ── V1 API sub-app ── */

const v1 = new Hono<Env>();

v1.use("*", logger());

// Error handler — include cause message for DB constraint errors
v1.onError((err, c) => {
  console.error(err);
  const causeMsg = err.cause instanceof Error ? err.cause.message : "";
  const msg = causeMsg ? `${err.message} - ${causeMsg}` : (err.message || "Internal Server Error");
  return c.json({ error: msg }, 500);
});

// Public routes
v1.route("/health", health);
v1.route("/auth", authRoutes);

// Auth middleware for all subsequent routes
v1.use("*", async (c, next) => {
  const result = await authenticate(c.req.raw);
  if (!result) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("authResult", result);
  await next();
});

// Routes
v1.route("/projects", projects);
v1.route("/problems", problems);
v1.route("/answers", answers);
v1.route("/flashcards", flashcards);
v1.route("/flashcard-reviews", flashcardReviews);
v1.route("/reviews", reviews);
v1.route("/api-keys", apiKeys);
v1.route("/users", users);
v1.route("/statuses", statuses);
v1.route("/tags", tags);
v1.route("/review-tags", reviewTags);
v1.route("/problem-files", problemFiles);
v1.route("/problems-list", problemsList);
v1.route("/answers-list", answersList);
v1.route("/schedule", schedule);
v1.route("/notes", notes);
v1.route("/pdf-sync", pdfSync);

// /me endpoint — return authenticated user info
v1.get("/me", (c) => {
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

const app = new Hono().basePath("/api");

app.route("/v1", v1);
app.route("/auth/google", googleAuth);
app.route("/drive", drive);

export default app;
