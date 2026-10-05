import { useEffect, useMemo, useState } from "react";
import { on } from "../../ipc/events";
import { initState } from "../../state/bridge";
import { TrayFlyout } from "./TrayFlyout";
import { createTrayPorts } from "./trayPorts";

/** `#/tray`: the 320x440 flyout window. Rust toggles and positions it, then emits `tray://shown`. */
export function TrayRoute() {
  const ports = useMemo(createTrayPorts, []);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const stop = initState();
    const sub = on("tray://shown", () => setShown((n) => n + 1));
    return () => {
      void stop.then((f) => f());
      void sub.then((f) => f());
    };
  }, []);
  // Remounting replays the scale-in, refocuses the field and reloads open items.
  return <TrayFlyout key={shown} ports={ports} />;
}
