import type { ReactElement } from "react";
import { Placeholder } from "./features/Placeholder";
import { NotchRoute } from "./features/notch/NotchRoute";

export const ROUTES = [
  "notch",
  "capture",
  "toast",
  "tray",
  "settings",
  "onboarding",
  "about",
  "legal",
  "backdrop",
] as const;
export type RouteName = (typeof ROUTES)[number];

/** Route comes from the URL hash: `#/notch`, `#/legal/privacy`, ... */
export function parseRoute(hash: string): { name: RouteName; arg?: string } {
  const [name, arg] = hash.replace(/^#\/?/, "").split("/");
  const found = ROUTES.find((r) => r === name) ?? "settings";
  return arg ? { name: found, arg } : { name: found };
}

export function renderRoute(hash: string): ReactElement {
  const { name } = parseRoute(hash);
  if (name === "notch") return <NotchRoute />;
  return <Placeholder name={name} />;
}
