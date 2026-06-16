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

const StatsPage = lazy(() => import("./app/(pages)/stats/page"));
const DigestPage = lazy(() => import("./app/(pages)/digest/page"));
const DigestDetailPage = lazy(() => import("./app/(pages)/digest/$scopeId/page"));
const StatsDetailPage = lazy(() => import("./app/(pages)/stats/$scopeId/page"));
const FlashcardsPage = lazy(() => import("./app/(pages)/flashcards/page"));
const SubjectsPage = lazy(() => import("./app/(pages)/subjects/page"));
const LevelsPage = lazy(() => import("./app/(pages)/levels/page"));
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
const HabitsPage = lazy(() => import("./app/(pages)/habits/page"));
const PrintExamPage = lazy(() => import("./app/(pages)/print/exam/page"));

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

// Print layout (AuthGate + FieldProvider のみ。AppLayout (sidebar/header) は通さず
// 純粋な印刷キャンバスを描画する)
const printLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "print",
  component: () => (
    <AuthGate>
      <FieldProvider>
        <Suspense>
          <Outlet />
        </Suspense>
      </FieldProvider>
    </AuthGate>
  ),
});

const printExamRoute = createRoute({
  getParentRoute: () => printLayout,
  path: "/print/exam",
  validateSearch: (search: Record<string, unknown>): {
    problem_ids?: string;
    title?: string;
    header?: string;
  } => ({
    problem_ids: typeof search.problem_ids === "string" ? search.problem_ids : undefined,
    title: typeof search.title === "string" ? search.title : undefined,
    header: typeof search.header === "string" ? search.header : undefined,
  }),
  component: () => <PrintExamPage />,
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
const statsRoute = scopeSearchRoute("/stats", StatsPage);
const digestRoute = scopeSearchRoute("/digest", DigestPage);
const digestDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/digest/$scope_id",
  component: () => (
    <Suspense>
      <DigestDetailPage />
    </Suspense>
  ),
});
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
const subjectsRoute = lazyRoute("/subjects", SubjectsPage);
const levelsRoute = lazyRoute("/levels", LevelsPage);
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
const habitsRoute = lazyRoute("/habits", HabitsPage);
const scopesDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/scopes/$scope_id",
  component: () => (
    <Suspense>
      <ScopesDetailPage />
    </Suspense>
  ),
});

// / → /plan redirect
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/plan" as string });
  },
});

// SSO callback (outside auth layout)
const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sso-callback",
  component: () => <AuthenticateWithRedirectCallback />,
});

const routeTree = rootRoute.addChildren([
  printLayout.addChildren([printExamRoute]),
  authLayout.addChildren([
    flashcardsRoute,
    subjectsRoute,
    levelsRoute,
    statusesRoute,
    usersRoute,
    apiKeysRoute,
    mastersRoute,
    aboutRoute,
    scopesRoute,
    scopesNewRoute,
    scopesDetailRoute,
    planRoute,
    habitsRoute,
    statsRoute,
    statsDetailRoute,
    digestRoute,
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
