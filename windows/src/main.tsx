import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installMockIPC, isTauri } from "./ipc/mock";
import { startDemo, withDemoBackdrop } from "./features/demo/boot";
import { initDemo } from "./features/demo/demoFlag";
import { renderRoute } from "./routes";
import { startTextScale } from "./state/textScale";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/a11y.css";

if (!isTauri()) installMockIPC();

startTextScale();

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
const root = createRoot(el);
void initDemo().then(() => {
  const hash = window.location.hash;
  root.render(<StrictMode>{withDemoBackdrop(hash, renderRoute(hash))}</StrictMode>);
  startDemo(hash);
});
