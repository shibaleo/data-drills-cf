import { lazy, Suspense } from "react";
import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { AuthGate } from "@/components/auth/auth-gate";
import { ProjectProvider } from "@/hooks/use-project";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthenticateWithRedirectCallback } from "@clerk/react";

/* ── Lazy page imports ── */

const SchedulePage = lazy(() => import("./app/(pages)/schedule/page"));
const ProblemsPage = lazy(() => import("./app/(pages)/problems/page"));
const AnswersPage = lazy(() => import("./app/(pages)/answers/page"));
const TimelinePage = lazy(() => import("./app/(pages)/timeline/page"));
const FlashcardsPage = lazy(() => import("./app/(pages)/flashcards/page"));
const NotesPage = lazy(() => import("./app/(pages)/notes/page"));
const TagsPage = lazy(() => import("./app/(pages)/tags/page"));
const SubjectsPage = lazy(() => import("./app/(pages)/subjects/page"));
const LevelsPage = lazy(() => import("./app/(pages)/levels/page"));
const TopicsPage = lazy(() => import("./app/(pages)/topics/page"));
const ProjectsPage = lazy(() => import("./app/(pages)/projects/page"));
const StatusesPage = lazy(() => import("./app/(pages)/statuses/page"));
const UsersPage = lazy(() => import("./app/(pages)/users/page"));
const ApiKeysPage = lazy(() => import("./app/(pages)/api-keys/page"));
const MastersPage = lazy(() => import("./app/(pages)/masters/page"));
const AboutPage = lazy(() => import("./app/(pages)/about/page"));
const PlansPage = lazy(() => import("./app/(pages)/plans/page"));
const PlanNewPage = lazy(() => import("./app/(pages)/plans/new/page"));
const PlanDetailPage = lazy(() => import("./app/(pages)/plans/$planId/page"));

/* ── Route tree ── */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Authenticated layout (AuthGate + ProjectProvider + AppLayout)
const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <AuthGate>
      <ProjectProvider>
        <AppLayout>
          <Suspense>
            <Outlet />
          </Suspense>
        </AppLayout>
      </ProjectProvider>
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

const scheduleRoute = lazyRoute("/schedule", SchedulePage);
const problemsRoute = lazyRoute("/problems", ProblemsPage);
const answersRoute = lazyRoute("/answers", AnswersPage);
const timelineRoute = lazyRoute("/timeline", TimelinePage);
const flashcardsRoute = lazyRoute("/flashcards", FlashcardsPage);
const notesRoute = lazyRoute("/notes", NotesPage);
const tagsRoute = lazyRoute("/tags", TagsPage);
const subjectsRoute = lazyRoute("/subjects", SubjectsPage);
const levelsRoute = lazyRoute("/levels", LevelsPage);
const topicsRoute = lazyRoute("/topics", TopicsPage);
const projectsRoute = lazyRoute("/projects", ProjectsPage);
const statusesRoute = lazyRoute("/statuses", StatusesPage);
const usersRoute = lazyRoute("/users", UsersPage);
const apiKeysRoute = lazyRoute("/api-keys", ApiKeysPage);
const mastersRoute = lazyRoute("/masters", MastersPage);
const aboutRoute = lazyRoute("/about", AboutPage);
const plansRoute = lazyRoute("/plans", PlansPage);
const planNewRoute = lazyRoute("/plans/new", PlanNewPage);
const planDetailRoute = createRoute({
  getParentRoute: () => authLayout,
  path: "/plans/$planId",
  component: () => (
    <Suspense>
      <PlanDetailPage />
    </Suspense>
  ),
});

// / → /schedule redirect
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/schedule" as string });
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
    scheduleRoute,
    problemsRoute,
    answersRoute,
    timelineRoute,
    flashcardsRoute,
    notesRoute,
    tagsRoute,
    subjectsRoute,
    levelsRoute,
    topicsRoute,
    projectsRoute,
    statusesRoute,
    usersRoute,
    apiKeysRoute,
    mastersRoute,
    aboutRoute,
    plansRoute,
    planNewRoute,
    planDetailRoute,
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
