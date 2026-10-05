import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // The repo's legal/*.md are bundled into the About and legal windows (`?raw`).
  server: { port: 1420, strictPort: true, host: "127.0.0.1", fs: { allow: [".."] } },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
