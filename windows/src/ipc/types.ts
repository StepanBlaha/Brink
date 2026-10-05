/** Payload types mirrored by serde structs in src-tauri (camelCase). */
export interface AppVersion {
  marketing: string;
  build: string;
}

export interface AppError {
  kind: string;
  message: string;
  transient: boolean;
  code?: string;
}

// ---- M1: auth ----

export type AuthKind = "internal" | "oauth";

export interface OAuthWorkspace {
  workspaceId?: string;
  workspaceName?: string;
  workspaceIcon?: string;
  botId?: string;
}

/** `auth_status`: never contains the token. */
export interface AuthStatus {
  kind: AuthKind | null;
  workspace?: OAuthWorkspace;
}

export interface ConnectionTestResult {
  count: number;
}

// ---- M1: write queue ----

/** Result of `queue_submit` (WriteQueue.Outcome). */
export type QueueOutcome =
  | { kind: "saved" }
  | { kind: "queued"; message: string }
  | { kind: "failed"; message: string };

/** Payload of the `queue://changed` event. */
export interface QueueState {
  pending: number;
  lastError: string | null;
}

// ---- M1: cache ----

export type CacheKind = "rows" | "blocks" | "editor-doc";

// ---- M1: settings (plan 2.6.5) ----

export type DockEdge = "left" | "right" | "top";
export type PillStyleSetting = "hidden" | "dot" | "line" | "percent";
export type AccentPreset =
  | "pink" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "indigo" | "purple" | "offWhite" | "system";
export type DockSize = "small" | "medium" | "large";
export type BadgeMode = "off" | "open" | "dueToday";
export type PillProgressMode = "off" | "activeGroup" | "lastPin";

export interface Settings {
  dockEdge: DockEdge;
  pillStyle: PillStyleSetting;
  pillShowsFraction: boolean;
  /** "main" | "mouse" | "screen:<name>\t<x>,<y>,<w>,<h>" */
  displayPreference: string;
  accentPreset: AccentPreset;
  dockSize: DockSize;
  /** Absent (or empty) = All pins. */
  activeGroupID?: string;
  badgeMode: BadgeMode;
  pillProgressMode: PillProgressMode;
  notchOutline: boolean;
  soundsEnabled: boolean;
  menuBarListEnabled: boolean;
  menuBarShowOpenCount: boolean;
  showTodayPin: boolean;
  remindersEnabled: boolean;
  /** 0-23 */
  reminderHour: number;
  morningSummaryEnabled: boolean;
  /** 0-1439 */
  morningSummaryMinutes: number;
  peekForReminders: boolean;
  lastOpenedPinID?: string;
  quickCaptureLastPinID?: string;
  onboardingCompleted: boolean;
  /** pinId to [width, height], logical px. */
  panelSizes: Record<string, [number, number]>;
  /** action to Tauri accelerator string. */
  hotkeys: Record<string, string>;
  hideInFullScreen: boolean;
}

export const defaultSettings: Settings = {
  dockEdge: "right",
  pillStyle: "line",
  pillShowsFraction: true,
  displayPreference: "main",
  accentPreset: "blue",
  dockSize: "medium",
  badgeMode: "open",
  pillProgressMode: "off",
  notchOutline: true,
  soundsEnabled: true,
  menuBarListEnabled: true,
  menuBarShowOpenCount: false,
  showTodayPin: true,
  remindersEnabled: false,
  reminderHour: 9,
  morningSummaryEnabled: false,
  morningSummaryMinutes: 480,
  peekForReminders: true,
  onboardingCompleted: false,
  panelSizes: {},
  hotkeys: {},
  hideInFullScreen: true,
};

/** Fills missing keys with defaults (Rust also validates; this keeps the UI total). */
export function withSettingDefaults(raw: Partial<Settings> | null | undefined): Settings {
  const merged: Settings = { ...defaultSettings, ...(raw ?? {}) };
  if (merged.activeGroupID === "") delete merged.activeGroupID;
  return merged;
}

// ---- M1: uploads ----

export type UploadSource = { path: string } | { bytes: number[] };
