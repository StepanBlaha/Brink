import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { ONBOARDING_STEPS, primaryLabel } from "../../domain/store/onboarding";
import { OPEN_ADD_EVENT } from "../../ipc/windowsIpc";
import { initState } from "../../state/bridge";
import { useSettingsStore } from "../../state/settingsStore";
import { useConnection } from "../settings/useConnection";
import { Connect, PinFirst, Welcome } from "./steps";
import styles from "./onboarding.module.css";

/** The 460x440 welcome: welcome, connect, pin your first page. */
export function OnboardingWindow() {
  const [step, setStep] = useState(0);
  const [forward, setForward] = useState(true);
  const c = useConnection();
  useEffect(() => {
    const stop = initState();
    return () => void stop.then((f) => f());
  }, []);
  const go = (next: number) => {
    setForward(next > step);
    setStep(next);
  };
  const finish = () => {
    void useSettingsStore.getState().update({ onboardingCompleted: true }).catch(() => {});
    void emit(OPEN_ADD_EVENT, null).catch(() => {});
    void getCurrentWindow().close().catch(() => {});
  };
  const primary = () => (step === 0 ? go(1) : step === 1 ? go(2) : finish());
  return (
    <div className={styles.window}>
      <div className={styles.stage}>
        <div key={step} className={`${styles.slide} ${forward ? styles.fromRight : styles.fromLeft}`}>
          {step === 0 ? <Welcome /> : step === 1 ? <Connect c={c} /> : <PinFirst />}
        </div>
      </div>
      <footer className={styles.footer}>
        <div className={styles.side}>
          {step > 0 && <button type="button" className={styles.back} onClick={() => go(step - 1)}>Back</button>}
        </div>
        <div className={styles.dots} role="img" aria-label={`Step ${step + 1} of ${ONBOARDING_STEPS}`}>
          {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
            <span key={i} className={`${styles.dot} ${i === step ? styles.dotOn : ""}`} />
          ))}
        </div>
        <button type="button" className={styles.primary} autoFocus onClick={primary}>{primaryLabel(step, c.hasToken)}</button>
      </footer>
    </div>
  );
}
