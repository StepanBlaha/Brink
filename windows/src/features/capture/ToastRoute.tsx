import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { captureEvents } from "../../ipc/captureIpc";
import { on } from "../../ipc/events";
import styles from "./toast.module.css";

interface ToastPayload {
  message: string;
  isError: boolean;
}

export const toastTiming = { fadeIn: 0.18, hold: 1.7, errorHold: 2.6, fadeOut: 0.35 } as const;

/** `#/toast`: click-through pill. Rust shows/hides the window; this fades the pill inside it. */
export function ToastRoute() {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let id = 0;
    let timer = 0;
    const sub = on<ToastPayload>(captureEvents.toast, (p) => {
      window.clearTimeout(timer);
      setToast({ ...p, id: ++id });
      setShown(true);
      const hold = p.isError ? toastTiming.errorHold : toastTiming.hold;
      timer = window.setTimeout(() => setShown(false), hold * 1000);
    });
    return () => {
      window.clearTimeout(timer);
      void sub.then((f) => f());
    };
  }, []);

  if (!toast) return null;
  return (
    <div className={styles.root}>
      <motion.div
        key={toast.id}
        className={`${styles.pill} ${toast.isError ? styles.error : ""}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: shown ? 1 : 0 }}
        transition={{ duration: shown ? toastTiming.fadeIn : toastTiming.fadeOut, ease: "easeInOut" }}
      >
        {toast.message}
      </motion.div>
    </div>
  );
}
