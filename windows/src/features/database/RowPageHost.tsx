import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { contents, instant } from "../../theme/motion";
import { OpenRowPageContext } from "./rowPageContext";
import { rowPageRouter, type RowPageRouter } from "./rowPageRouter";
import type { RowPageTarget } from "./rowPageTarget";
import { RowPageView } from "./RowPageView";
import styles from "./rowPage.module.css";

interface Props {
  pinId: string;
  /** Fixed page height for hosts without a bounded frame (a database embedded in a page). */
  pageHeight?: number;
  router?: RowPageRouter;
  renderPage?: (target: RowPageTarget) => ReactNode;
  openExternal?: (id: string) => void;
  children: ReactNode;
}

/**
 * Shows a list and, when a row is opened, that row's page in its place with a back header.
 * The list stays mounted (hidden) so its scroll position survives going back.
 */
export function RowPageHost({ pinId, pageHeight, router = rowPageRouter, renderPage, openExternal, children }: Props) {
  const reduce = useReducedMotion() ?? false;
  const [target, setTarget] = useState<RowPageTarget | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const version = useSyncExternalStore(router.subscribe, router.getVersion);

  useEffect(() => {
    const next = router.take(pinId);
    if (next) {
      origin.current = null;
      setTarget(next);
    }
  }, [router, pinId, version]);

  const open = useCallback((rowId: string, title: string, from?: HTMLElement | null) => {
    origin.current = from ?? null;
    setTarget({ pinId, rowId, title });
  }, [pinId]);
  const close = useCallback(() => setTarget(null), []);

  // Back to the row that opened the page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!target && wasOpen.current) origin.current?.focus({ preventScroll: true });
    wasOpen.current = target !== null;
  }, [target]);

  const isOpen = target !== null;
  return (
    <div className={styles.host}>
      <OpenRowPageContext.Provider value={open}>
        <motion.div
          className={`${styles.list} ${isOpen ? styles.listHidden : ""}`}
          animate={{ opacity: isOpen ? 0 : 1, x: isOpen && !reduce ? -16 : 0 }}
          transition={reduce ? instant : contents}
          aria-hidden={isOpen}
          inert={isOpen}
        >
          {children}
        </motion.div>
      </OpenRowPageContext.Provider>
      <AnimatePresence>
        {target && (
          <motion.div
            key={target.rowId}
            style={pageHeight ? { position: "relative", height: pageHeight } : { position: "absolute", inset: 0 }}
            initial={{ opacity: 0, x: reduce ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : 24 }}
            transition={reduce ? instant : contents}
          >
            <RowPageView target={target} onBack={close} {...(renderPage ? { renderPage } : {})} {...(openExternal ? { openExternal } : {})} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
