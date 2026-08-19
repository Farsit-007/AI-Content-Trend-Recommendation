import { createElement, Suspense } from "react";
import type { RouteObject } from "react-router-dom";
import type { TUserPath } from "@/types";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { RouteErrorBoundary } from "@/components/layout/RouteErrorBoundary";

/**
 * Turn a role's path config into router route objects.
 *
 * Each element is wrapped in three layers, outermost first:
 *  - `ProtectedRoute` when the entry declares `roles`, so a role-restricted page is gated.
 *  - `Suspense`, because every page in the route arrays is a `React.lazy` component — the whole
 *    admin console used to ship in the main bundle to every user, including anonymous visitors
 *    landing on `/`, since static imports in the route arrays pulled it into the router tree.
 *  - `RouteErrorBoundary`, so a render error in one page shows a recovery affordance inside the
 *    dashboard shell instead of blanking the entire app.
 */
export const routeGenerator = (items: TUserPath[]): RouteObject[] => {
  return items.reduce((acc: RouteObject[], item) => {
    if (!item.element) return acc;

    const withBoundary = createElement(
      RouteErrorBoundary,
      null,
      createElement(Suspense, { fallback: createElement(RouteFallback) }, item.element),
    );

    const element = item.roles
      ? createElement(ProtectedRoute, { roles: item.roles }, withBoundary)
      : withBoundary;

    if (item.index) {
      acc.push({ index: true, element });
    } else if (item.path) {
      acc.push({ path: item.path, element });
    }
    return acc;
  }, []);
};
