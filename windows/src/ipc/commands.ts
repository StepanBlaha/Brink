import { invoke } from "@tauri-apps/api/core";
import type { AppVersion } from "./types";

/** Typed wrappers. No component calls `invoke` directly. */
export function appVersion(): Promise<AppVersion> {
  return invoke<AppVersion>("app_version");
}
