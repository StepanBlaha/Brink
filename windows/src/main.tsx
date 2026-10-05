import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installMockIPC, isTauri } from "./ipc/mock";
import { renderRoute } from "./routes";
import "./styles/tokens.css";
import "./styles/reset.css";

if (!isTauri()) installMockIPC();

const el = document.getElementById("root");
if (!el) throw new Error("missing #root");
createRoot(el).render(<StrictMode>{renderRoute(window.location.hash)}</StrictMode>);
