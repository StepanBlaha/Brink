import type { ReactElement } from "react";
import { parseRoute } from "../../routes";
import { DuskLayers } from "./DemoBackdrop";
import { demoSnapshot, isDemo, realTauri } from "./demoFlag";
import { startDirector } from "./director/start";

/** Browser dev only: paints the dusk wallpaper behind the notch page (Tauri has its own window). */
export function withDemoBackdrop(hash: string, node: ReactElement): ReactElement {
  if (!isDemo() || realTauri() || parseRoute(hash).name !== "notch") return node;
  return (
    <>
      <DuskLayers />
      {node}
    </>
  );
}

/** Starts the scripted director in the notch window when demo mode is on. */
export function startDemo(hash: string): void {
  if (!isDemo() || parseRoute(hash).name !== "notch") return;
  void startDirector(demoSnapshot(), realTauri());
}
