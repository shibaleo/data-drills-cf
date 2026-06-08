import { lazy, Suspense } from "react";
import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { AuthGate } from "@/components/auth/auth-gate";
import { FieldProvider } from "@/hooks/use-field";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthenticateWithRedirectCallback } from "@clerk/react";

/* ── Lazy page imports ── */

const ReviewPage = lazy(() => import("./app/(pages)/review/page"));
const StatsPage = lazy(() => import("./app/(pages)/stats/page"));
const DigestPage = lazy(() => import("./app/(pages)/digest/page"));
const DigestNewPage = lazy(() => import("./app/(pages)/digest/new/page"));
const DigestDetailPage = lazy(() => import("./app/(pages)/digest/$scopeId/page"));
const StatsNewPage = lazy(() => import("./app/(pages)/stats/new/page"));
const StatsDetailPage = lazy(() => import("./app/(pages)/stats/$scopeId/page"));
const ThroughputPage = lazy(() => import("./app/(pages)/throughput/page"));
const FlashcardsPage = lazy(() => import("./app/(pages)/flashcards/page"));
const TagsPage = lazy(() => import("./app/(pages)/tags/page"));
const SubjectsPage = lazy(() => import("./app/(pages)/subjects/page"));
const LevelsPage = lazy(() => import("./app/(pages)/levels/page"));
const ProjectsPage = lazy(() => import("./app/(pages)/projects/page"));
const StatusesPage = lazy(() => import("./app/(pages)/statuses/page"));
const UsersPage = lazy(() => import("./app/(pages)/users/page"));
const ApiKeysPage = lazy(() => import("./app/(pages)/api-keys/page"));
const MastersPage = lazy(() => import("./app/(pages)/masters/page"));
const AboutPage = lazy(() => import("./app/(pages)/about/page"));
// Phase 3b: backlog → scopes リネーム (UI のみ。API は当面 backlog routes を共有 = scope.id === backlog.id)
const ScopesPage = lazy(() => import("./app/(pages)/scopes/page"));
const ScopesNewPage = lazy(() => import("./app/(pages)/scopes/new/page"));
const ScopesDetailPage = lazy(() => import("./app/(pages)/scopes/$scopeId/page"));
const PlanPage = lazy(() => import("./app/(pages)/plan/page"));
const ReviewNewPage = lazy(() => import("./app/(pages)/review/new/page"));
const ReviewDetailPage = lazy(() => import("./app/(pages)/review/$scopeId/page"));
const ThroughputNewPage = lazy(() => import("./app/(pages)/throughput/new/page"));
const ThroughputDetailPage = lazy(() => import("./app/(pages)/throughput/$scopeId/page"));

/* ── Route tree ── */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Authenticated layout (AuthGate + FieldProvider + AppLayout)
const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <AuthGate>
      <FieldProvider>
        <AppLayout>
          <Suspense>
            <Outlet />
          </Suspense>
        </AppLayout>
      </FieldProvider>
    </AuthGate>
  ),
});

function lazyRoute(
  path: string,
  Component: React.LazyExoticComponent<React.ComponentType>,
) {
  return createRoute({
    getParentRoute: () => authLayout,
    path,
    component: () => <Component />,
  });
}

const reviewRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/review",
  validateSearch: (search: Record<string, unknown>): { scope_id?: string } => ({
    scope_id: typeof search.scope_id === "string" ? search.scope_id : undefined,
  }),
  component: () => (
    <Suspense>
      <ReviewPage />
    </Suspense>
  ),
});
const reviewNewRoute = lazyRoute("/review/new", ReviewNewPage);
const reviewDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/review/$scope_id",
  component: () => (
    <Suspense>
      <ReviewDetailPage />
    </Suspense>
  ),
});
const throughputNewRoute = lazyRoute("/throughput/new", ThroughputNewPage);
const throughputDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/throughput/$scope_id",
  component: () => (
    <Suspense>
      <ThroughputDetailPage />
    </Suspense>
  ),
});
function scopeSearchRoute(path: string, Component: React.LazyExoticComponent<React.ComponentType>) {
  return createRoute({
    getParentRoute: () => authLayout,
    path,
    validateSearch: (search: Record<string, unknown>): { scope_id?: string } => ({
      scope_id: typeof search.scope_id === "string" ? search.scope_id : undefined,
    }),
    component: () => (
      <Suspense>
        <Component />
      </Suspense>
    ),
  });
}
const throughputRoute = scopeSearchRoute("/throughput", ThroughputPage);
const statsRoute = scopeSearchRoute("/stats", StatsPage);
const digestRoute = scopeSearchRoute("/digest", DigestPage);
const digestNewRoute = lazyRoute("/digest/new", DigestNewPage);
const digestDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/digest/$scope_id",
  component: () => (
    <Suspense>
      <DigestDetailPage />
    </Suspense>
  ),
});
const statsNewRoute = lazyRoute("/stats/new", StatsNewPage);
const statsDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/stats/$scope_id",
  component: () => (
    <Suspense>
      <StatsDetailPage />
    </Suspense>
  ),
});
const flashcardsRoute = lazyRoute("/flashcards", FlashcardsPage);
const tagsRoute = lazyRoute("/tags", TagsPage);
const subjectsRoute = lazyRoute("/subjects", SubjectsPage);
const levelsRoute = lazyRoute("/levels", LevelsPage);
const projectsRoute = lazyRoute("/projects", ProjectsPage);
const statusesRoute = lazyRoute("/statuses", StatusesPage);
const usersRoute = lazyRoute("/users", UsersPage);
const apiKeysRoute = lazyRoute("/api-keys", ApiKeysPage);
const mastersRoute = lazyRoute("/masters", MastersPage);
const aboutRoute = lazyRoute("/about", AboutPage);
const scopesRoute = lazyRoute("/scopes", ScopesPage);
const planRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/plan",
  validateSearch: (search: Record<string, unknown>): { scope_id?: string } => ({
    scope_id: typeof search.scope_id === "string" ? search.scope_id : undefined,
  }),
  component: () => (
    <Suspense>
      <PlanPage />
    </Suspense>
  ),
});
const scopesNewRoute = lazyRoute("/scopes/new", ScopesNewPage);
const scopesDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/scopes/$scope_id",
  component: () => (
    <Suspense>
      <ScopesDetailPage />
    </Suspense>
  ),
});

// / → /review redirect
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/review" as string });
  },
});

// SSO callback (outside auth layout)
const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sso-callback",
  component: () => <AuthenticateWithRedirectCallback />,
});

const routeTree = rootRoute.addChildren([
  authLayout.addChildren([
    reviewRoute,
    reviewNewRoute,
    reviewDetailRoute,
    flashcardsRoute,
    tagsRoute,
    subjectsRoute,
    levelsRoute,
    projectsRoute,
    statusesRoute,
    usersRoute,
    apiKeysRoute,
    mastersRoute,
    aboutRoute,
    scopesRoute,
    scopesNewRoute,
    scopesDetailRoute,
    planRoute,
    throughputRoute,
    throughputNewRoute,
    throughputDetailRoute,
    statsRoute,
    statsNewRoute,
    statsDetailRoute,
    digestRoute,
    digestNewRoute,
    digestDetailRoute,
  ]),
  indexRoute,
  ssoCallbackRoute,
]);

export const router = createRouter({ routeTree });

// Type registration for TanStack Router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
