import { useCallback, useEffect, useState } from "react";
import {
  comboFor, conflict, conflictMessage, formatCombo, hotkeyActions, hotkeyDefaults, hotkeyTitles, parseAccelerator,
  type Combo, type HotkeyAction,
} from "../../domain/store/hotkeys";
import { hotkeysStatus, onHotkeyFailed } from "../../ipc/hotkeysIpc";
import { useSettingsStore } from "../../state/settingsStore";
import { ShortcutRecorder } from "./ShortcutRecorder";
import styles from "./shortcuts.module.css";
import base from "./settings.module.css";

export const TOGGLE_HINT = "Alt+Space also opens the window menu in Windows. Change it here if you use that.";

/** Shortcuts settings: one row per action, rebindable with a conflict check. */
export function ShortcutsSection() {
  const bindings = useSettingsStore((s) => s.settings.hotkeys);
  const update = useSettingsStore((s) => s.update);
  const [errors, setErrors] = useState<Partial<Record<HotkeyAction, string | null>>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const refreshStatus = useCallback(async () => {
    const status = await hotkeysStatus();
    setFailed(new Set(status.filter((r) => !r.ok).map((r) => r.action)));
  }, []);

  useEffect(() => {
    void refreshStatus();
    const stop = onHotkeyFailed(() => void refreshStatus()).catch(() => () => undefined);
    return () => void stop.then((f) => f());
  }, [refreshStatus]);

  const setError = (action: HotkeyAction, message: string | null) => setErrors((e) => ({ ...e, [action]: message }));

  const save = async (next: Record<string, string>) => {
    await update({ hotkeys: next });
    await refreshStatus();
  };

  const commit = (action: HotkeyAction, combo: Combo) => {
    const clash = conflict(bindings, action, combo);
    if (clash !== null) return setError(action, conflictMessage(clash, combo, action, false));
    setError(action, null);
    void save({ ...bindings, [action]: formatCombo(combo) });
  };

  const reset = (action: HotkeyAction) => {
    const combo = parseAccelerator(hotkeyDefaults[action]) as Combo;
    const clash = conflict(bindings, action, combo);
    if (clash !== null) return setError(action, conflictMessage(clash, combo, action, true));
    setError(action, null);
    const rest = { ...bindings };
    delete rest[action];
    void save(rest);
  };

  return (
    <section className={base.section}>
      <h2 className={base.h}>Shortcuts</h2>
      <div className={styles.list}>
        {hotkeyActions.map((action) => {
          const accelerator = formatCombo(comboFor(bindings, action));
          const isDefault = accelerator === hotkeyDefaults[action];
          return (
            <div key={action} className={styles.row}>
              <span className={styles.title}>{hotkeyTitles[action]}</span>
              <ShortcutRecorder
                action={action}
                accelerator={accelerator}
                label={hotkeyTitles[action]}
                error={errors[action] ?? null}
                onCommit={(c) => commit(action, c)}
                onError={(m) => setError(action, m)}
              />
              {isDefault ? <span className={styles.slot} /> : (
                <button type="button" className={styles.reset} onClick={() => reset(action)}>
                  Reset
                </button>
              )}
              {failed.has(action) && <span className={styles.badge}>In use by another app</span>}
              {action === "toggleLastPin" && <p className={styles.hint}>{TOGGLE_HINT}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
