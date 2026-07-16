import { createElement } from "react";
import type { RouteObject } from "react-router-dom";
import type { TUserPath } from "@/types";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

/** Turn a role's path config into router route objects, wrapping any
 *  role-restricted entry in a <ProtectedRoute roles={...}> guard. */
export const routeGenerator = (items: TUserPath[]): RouteObject[] => {
  return items.reduce((acc: RouteObject[], item) => {
    if (!item.element) return acc;

    const element = item.roles
      ? createElement(ProtectedRoute, { roles: item.roles }, item.element)
      : item.element;

    if (item.index) {
      acc.push({ index: true, element });
    } else if (item.path) {
      acc.push({ path: item.path, element });
    }
    return acc;
  }, []);
};
