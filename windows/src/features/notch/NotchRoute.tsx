import { useState } from "react";
import { useNotchStore } from "../../state/notchStore";
import "./notchWindow.css";
import { NotchRoot } from "./NotchRoot";
import { parseParams } from "./params";

/** `#/notch`: applies query-param config (debug and screenshots) before the first render. */
export function NotchRoute() {
  useState(() => {
    useNotchStore.getState().setConfig(parseParams(window.location.search));
    return true;
  });
  return <NotchRoot />;
}
