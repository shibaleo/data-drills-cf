/**
 * Routing primitives — thin wrappers around TanStack Router.
 */

export { Link, redirect } from "@tanstack/react-router";
import {
  useRouter as useTanStackRouter,
  useLocation as useTanStackLocation,
} from "@tanstack/react-router";

/** Returns the current pathname string (compat with Next.js usePathname) */
export function usePathname(): string {
  return useTanStackLocation().pathname;
}

/** useRouter with push() compat for Next.js-style navigation */
export function useRouter() {
  const router = useTanStackRouter();
  return {
    ...router,
    push: (to: string) => router.navigate({ to }),
  };
}
