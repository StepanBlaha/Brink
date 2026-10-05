import { useEffect, useMemo, useRef, useState } from "react";
import { on } from "../../ipc/events";
import { requestCounts, startSummaryReceiver } from "../../services/summaryBridge";
import { initState } from "../../state/bridge";
import { TrayFlyout } from "./TrayFlyout";
import { createTrayPorts } from "./trayPorts";

const COUNTS_WINDOW_MS = 1500;

/** `#/tray`: the 320x440 flyout window. Rust toggles and positions it, then emits `tray://shown`. */
export function TrayRoute() {
  const ports = useMemo(createTrayPorts, []);
  const [shown, setShown] = useState(0);
  const shownAt = useRef(0);
  useEffect(() => {
    const stop = initState();
    const sub = on("tray://shown", () => {
      shownAt.current = Date.now();
      requestCounts();
      setShown((n) => n + 1);
    });
    // Counts that arrive right after the flyout opened redraw it; later ones wait for the next open
    // (a remount would drop what the person is typing).
    const counts = startSummaryReceiver(() => {
      if (Date.now() - shownAt.current < COUNTS_WINDOW_MS) setShown((n) => n + 1);
    });
    return () => {
      void stop.then((f) => f());
      void sub.then((f) => f());
      void counts.then((f) => f());
    };
  }, []);
  // Remounting replays the scale-in, refocuses the field and reloads open items.
  return <TrayFlyout key={shown} ports={ports} />;
}
