import { baseKeymap } from "prosemirror-commands";
import { Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { captureHide, captureShow, trayFlyoutHide, trayFlyoutToggle } from "../../../ipc/captureIpc";
import { demoMark, demoWait } from "../demoIpc";
import type { DirectorEnv, NativeAction } from "./sequence";

type Win = Window & {
  __notch?: (c: string) => void;
  /** Browser capture hook: called with the still's name (CDP binding). */
  __demoShot?: (name: string) => void;
  /** The capture script calls this once the still was taken. */
  __demoShotAck?: () => void;
};

const w = (): Win => window as Win;
const ignore = (): void => undefined;

function fire(el: Element, type: string, init: MouseEventInit = {}): void {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
}

/** Clicks the first element matching `sel` whose row or block text contains `within`. */
export function clickMatching(root: ParentNode, sel: string, within?: string): boolean {
  const hit = [...root.querySelectorAll(sel)].find((el) => {
    if (!within) return true;
    const box = el.closest('[data-testid="db-row"], [data-testid="peek"]') ?? el.parentElement;
    return (box?.textContent ?? "").includes(within) || (el.getAttribute("aria-label") ?? "").includes(within);
  });
  if (!hit) return false;
  for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) fire(hit, t);
  return true;
}

/** The editor view the demo flag exposes as `window.__brink` (see BrinkEditor). */
function editorView(): EditorView | undefined {
  return (window as unknown as { __brink?: { view?: EditorView } }).__brink?.view;
}

/**
 * One typed character into whatever has focus. In the editor it goes through ProseMirror's own
 * typing pipeline (`handleTextInput` for the slash menu and input rules, else `insertText`),
 * which synthetic DOM key events cannot trigger. Elsewhere (find box, fields) it is an input.
 */
export function insertText(text: string): void {
  const el = document.activeElement;
  const view = editorView();
  if (view && el?.closest(".ProseMirror")) {
    const { from, to } = view.state.selection;
    if (!view.someProp("handleTextInput", (f) => f(view, from, to, text, () => view.state.tr.insertText(text, from, to)))) {
      view.dispatch(view.state.tr.insertText(text, from, to).scrollIntoView());
    }
    return;
  }
  if (document.execCommand("insertText", false, text)) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value + text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function pressKey(key: string, mods = ""): void {
  const target = document.activeElement ?? document.body;
  const m = mods.split("+");
  const init: KeyboardEventInit = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    bubbles: true,
    cancelable: true,
    ctrlKey: m.includes("ctrl"),
    shiftKey: m.includes("shift"),
    altKey: m.includes("alt"),
  };
  const down = new KeyboardEvent("keydown", init);
  const view = editorView();
  if (view && target.closest(".ProseMirror") && view.someProp("handleKeyDown", (f) => f(view, down))) return;
  target.dispatchEvent(down);
  target.dispatchEvent(new KeyboardEvent("keyup", init));
  // A synthetic key has no browser default: Backspace deletes a character, or joins, like the browser would.
  if (key === "Backspace" && view && target.closest(".ProseMirror") && !down.defaultPrevented) {
    const { from, empty, $from } = view.state.selection;
    if (empty && $from.parentOffset > 0) view.dispatch(view.state.tr.delete(from - 1, from));
    else baseKeymap["Backspace"]?.(view.state, view.dispatch, view);
  }
}

export function focusEditor(): void {
  const view = editorView();
  if (!view) return;
  view.focus();
  view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)).scrollIntoView());
}

const nativeActions: Record<NativeAction, () => Promise<void>> = {
  capture: captureShow,
  captureHide,
  tray: trayFlyoutToggle,
  trayHide: trayFlyoutHide,
};

export interface DomEnvOptions {
  /** Tauri with a marker folder: stills and handshakes go through marker files. */
  markers: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Browser dev: ask the capture binding for a still and wait for its ack (max 8 s). */
function browserShot(name: string): Promise<void> {
  const hook = w().__demoShot;
  if (!hook) return sleep(100);
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000);
    w().__demoShotAck = () => {
      clearTimeout(timer);
      resolve();
    };
    hook(name);
  });
}

export function createDomEnv({ markers }: DomEnvOptions): DirectorEnv {
  return {
    cmd: (c) => w().__notch?.(c),
    sleep,
    insert: insertText,
    key: pressKey,
    click: (sel, within) => void clickMatching(document, sel, within),
    focusEditor,
    shot: async (name) => {
      if (!markers) return browserShot(name);
      await demoMark(name).catch(ignore);
      await demoWait(`${name}-done`, 3000).catch(ignore);
    },
    mark: (name) => (markers ? demoMark(name).catch(ignore) : Promise.resolve()),
    waitMarker: async (name, timeoutMs) => {
      if (!markers) return sleep(Math.min(timeoutMs, 500)).then(() => false);
      return demoWait(name, timeoutMs).catch(() => false);
    },
    native: (a) => nativeActions[a]().catch(ignore),
    log: (line) => console.debug(`[demo] ${line}`),
  };
}
