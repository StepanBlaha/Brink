/** Global hotkey bindings (plan 3.g). Port of HotkeyCombo.swift; stored as Tauri accelerator strings. */
export type HotkeyAction = "toggleLastPin" | "openPinN" | "quickCapture" | "clipboardAppend";

export const hotkeyActions: readonly HotkeyAction[] = ["toggleLastPin", "openPinN", "quickCapture", "clipboardAppend"];

export const hotkeyTitles: Record<HotkeyAction, string> = {
  toggleLastPin: "Toggle last-opened pin",
  openPinN: "Open pin 1–9 of active group",
  quickCapture: "Quick capture",
  clipboardAppend: "Append clipboard",
};

/** For openPinN only the modifiers are stored. */
export const hotkeyDefaults: Record<HotkeyAction, string> = {
  toggleLastPin: "Alt+Space",
  openPinN: "Alt",
  quickCapture: "Alt+Shift+Space",
  clipboardAppend: "Ctrl+Alt+V",
};

export interface Combo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Tauri key name ("Space", "V", "1", "F5", "Up"); "" for modifiers only. */
  key: string;
}

const MODIFIER_NAMES: Record<string, "ctrl" | "alt" | "shift" | "meta"> = {
  ctrl: "ctrl", control: "ctrl", commandorcontrol: "ctrl", cmdorctrl: "ctrl",
  alt: "alt", option: "alt", shift: "shift",
  super: "meta", meta: "meta", win: "meta", windows: "meta", cmd: "meta", command: "meta",
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Canonical key name for user text ("space" -> "Space"), or null when unknown. */
function canonicalKey(name: string): string | null {
  if (name.length === 1) return name.toUpperCase();
  if (/^f([1-9]|1\d|2[0-4])$/i.test(name)) return name.toUpperCase();
  return Object.values(NAMED).find((v) => v.toLowerCase() === name.toLowerCase()) ?? null;
}

/** Parses "Ctrl+Alt+V" (case-insensitive modifiers); a lone "+" key is not supported. */
export function parseAccelerator(text: string): Combo | null {
  const combo: Combo = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  const parts = text.split("+").map((p) => p.trim());
  if (parts.some((p) => p === "")) return null;
  for (const part of parts) {
    const mod = MODIFIER_NAMES[part.toLowerCase()];
    if (mod) combo[mod] = true;
    else if (combo.key === "" && canonicalKey(part) !== null) combo.key = canonicalKey(part) as string;
    else return null;
  }
  return combo;
}

/** Display and storage order: Ctrl, Alt, Shift, (Win) then key, joined with "+". */
export function formatCombo(combo: Combo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  if (combo.meta) parts.push("Win");
  if (combo.key !== "") parts.push(combo.key);
  return parts.join("+");
}

/** What the user sees: openPinN shows "Alt+1–9". */
export function displayAccelerator(action: HotkeyAction, accelerator: string): string {
  if (action !== "openPinN") return accelerator;
  const combo = parseAccelerator(accelerator);
  return combo ? formatCombo({ ...combo, key: "1–9" }) : accelerator;
}

/** Every concrete combo the action occupies (nine for openPinN). */
export function occupiedCombos(action: HotkeyAction, combo: Combo): string[] {
  if (action === "openPinN") return DIGITS.map((d) => formatCombo({ ...combo, key: d }));
  return [formatCombo(combo)];
}

/** The effective combo for an action: stored value if parseable, else the default. */
export function comboFor(bindings: Record<string, string>, action: HotkeyAction): Combo {
  const stored = bindings[action];
  return (stored !== undefined ? parseAccelerator(stored) : null) ?? (parseAccelerator(hotkeyDefaults[action]) as Combo);
}

/** The other action already using any key `combo` would occupy for `action`, if any. */
export function conflict(bindings: Record<string, string>, action: HotkeyAction, combo: Combo): HotkeyAction | null {
  const wanted = new Set(occupiedCombos(action, combo));
  for (const other of hotkeyActions) {
    if (other === action) continue;
    if (occupiedCombos(other, comboFor(bindings, other)).some((c) => wanted.has(c))) return other;
  }
  return null;
}

export function conflictMessage(clash: HotkeyAction, combo: Combo, action: HotkeyAction, isReset: boolean): string {
  if (isReset) return `Default is in use by "${hotkeyTitles[clash]}"; change that one first.`;
  return `${displayAccelerator(action, formatCombo(combo))} is already used by "${hotkeyTitles[clash]}".`;
}

const RESERVED = new Set(["Ctrl+Alt+Delete", "Alt+Tab", "Ctrl+Alt+Tab", "Alt+Shift+Tab", "Alt+F4", "Ctrl+Esc", "Ctrl+Shift+Esc", "Alt+Esc", "Alt+Shift+Esc"]);

/** Returns an error message, or null when the combo can be registered. openPinN passes modifiers only. */
export function validateCombo(combo: Combo): string | null {
  if (combo.meta) return "Combos with the Windows key are reserved by Windows.";
  if (!combo.ctrl && !combo.alt) return "Use at least Ctrl or Alt.";
  if (combo.key === "PrintScreen") return "Print Screen combos are reserved by Windows.";
  if (RESERVED.has(formatCombo(combo))) return `${formatCombo(combo)} is reserved by Windows.`;
  return null;
}

const NAMED: Record<string, string> = {
  Space: "Space", Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
  Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", Escape: "Esc", PrintScreen: "PrintScreen",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
  Backquote: "`", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
};

/** Maps KeyboardEvent.code to a Tauri key name; null for modifiers and unsupported keys. */
export function keyNameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

/** The combo for a keydown, or null while only modifiers are held. */
export function comboFromKeyEvent(e: Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): Combo | null {
  const key = keyNameFromCode(e.code);
  if (key === null) return null;
  return { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, key };
}
