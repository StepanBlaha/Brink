import { useEffect, useState } from "react";
import { initState } from "../../state/bridge";
import { useNotchStore } from "../../state/notchStore";
import "./notchWindow.css";
import { NotchRoot } from "./NotchRoot";
import { parseParams } from "./params";
import { useSettingsSync } from "./useSettingsSync";

/** `#/notch`: applies query-param config (debug and screenshots) before the first render. */
export function NotchRoute() {
  useState(() => {
    useNotchStore.getState().setConfig(parseParams(window.location.search));
    return true;
  });
  useSettingsSync();
  useEffect(() => {
    const stop = initState();
    return () => void stop.then((f) => f());
  }, []);
  return <NotchRoot />;
}
