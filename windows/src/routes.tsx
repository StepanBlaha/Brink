import type { ReactElement } from "react";
import { Placeholder } from "./features/Placeholder";
import { EditorDemo } from "./editor/EditorDemo";
import { DatabaseDemo } from "./features/database/DatabaseDemo";
import { SettingsWindow } from "./features/settings/SettingsWindow";
import { CaptureRoute } from "./features/capture/CaptureRoute";
import { ToastRoute } from "./features/capture/ToastRoute";
import { TrayRoute } from "./features/tray/TrayRoute";
import { AboutWindow } from "./features/about/AboutWindow";
import { LegalWindow } from "./features/about/LegalWindow";
import { OnboardingWindow } from "./features/onboarding/OnboardingWindow";
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
  "dbdemo",
  "editordemo",
] as const;
export type RouteName = (typeof ROUTES)[number];

/** Route comes from the URL hash: `#/notch`, `#/legal/privacy`, ... */
export function parseRoute(hash: string): { name: RouteName; arg?: string } {
  const [name, arg] = hash.replace(/^#\/?/, "").split("/");
  const found = ROUTES.find((r) => r === name) ?? "settings";
  return arg ? { name: found, arg } : { name: found };
}

export function renderRoute(hash: string): ReactElement {
  const { name, arg } = parseRoute(hash);
  if (name === "notch") return <NotchRoute />;
  if (name === "dbdemo") return <DatabaseDemo />;
  if (name === "editordemo") return <EditorDemo />;
  if (name === "capture") return <CaptureRoute />;
  if (name === "toast") return <ToastRoute />;
  if (name === "tray") return <TrayRoute />;
  if (name === "settings") return <SettingsWindow initial={arg} />;
  if (name === "about") return <AboutWindow />;
  if (name === "legal") return <LegalWindow doc={arg} />;
  if (name === "onboarding") return <OnboardingWindow />;
  return <Placeholder name={name} />;
}
