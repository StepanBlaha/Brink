import { useEffect, useState, type KeyboardEvent } from "react";
import { comboFromKeyEvent, displayAccelerator, validateCombo, type Combo, type HotkeyAction } from "../../domain/store/hotkeys";
import { hotkeysSuspend } from "../../ipc/hotkeysIpc";
import styles from "./shortcuts.module.css";

interface Props {
  action: HotkeyAction;
  /** Stored accelerator ("Alt+Space"; modifiers only for openPinN). */
  accelerator: string;
  label: string;
  error: string | null;
  /** A valid combo was recorded (for openPinN, key is ""). The parent checks conflicts and may call back with an error. */
  onCommit: (combo: Combo) => void;
  onError: (message: string | null) => void;
}

/** Click, press a combo. Esc cancels. Global hotkeys are suspended while recording. */
export function ShortcutRecorder({ action, accelerator, label, error, onCommit, onError }: Props) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    void hotkeysSuspend(true);
    return () => void hotkeysSuspend(false);
  }, [recording]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") {
      setRecording(false);
      onError(null);
      return;
    }
    const combo = comboFromKeyEvent(e.nativeEvent);
    if (combo === null) return;
    if (action === "openPinN") {
      if (!/^[0-9]$/.test(combo.key)) return onError("Hold your modifiers and press a digit, for example Alt+1.");
      combo.key = "";
      const problem = validateCombo({ ...combo, key: "1" });
      if (problem) return onError(problem);
    } else {
      const problem = validateCombo(combo);
      if (problem) return onError(problem);
    }
    onError(null);
    setRecording(false);
    onCommit(combo);
  };

  return (
    <div className={styles.recorderWrap}>
      <button
        type="button"
        className={`${styles.recorder} ${recording ? styles.recording : ""}`}
        aria-label={label}
        aria-invalid={error !== null}
        onClick={() => setRecording(true)}
        onKeyDown={onKeyDown}
        onBlur={() => setRecording(false)}
      >
        {recording ? "Press keys…" : displayAccelerator(action, accelerator)}
      </button>
      {error !== null && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
