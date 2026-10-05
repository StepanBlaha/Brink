// Mac dev fallback for the Windows screenshots: drives the Vite pages (npm run dev:web) in demo
// state with headless Chrome over raw CDP and writes PNGs to docs/screens/m9/.
//
//   npm run demo:capture                      starts Vite itself, writes docs/screens/m9/*.png
//   npm run demo:capture -- --url http://127.0.0.1:1420 --out docs/screens/m9 --scales 1,1.5
//   npm run demo:capture -- --scripts screens,full      (the full marketing timeline too)
//   CHROME=/path/to/chrome npm run demo:capture      (default: /Applications/Google Chrome.app)
//
// The notch set runs the in-app DemoDirector (`?demo=1&script=screens`): every `shot` the
// director asks for becomes a screenshot. Other pages (editor demo, capture box, tray, settings)
// are plain navigations. Real Windows screenshots come from scripts/record-demo.ps1.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChrome, setViewport } from "./lib/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = join(root, opt("out", "docs/screens/m9"));
const scales = opt("scales", "1").split(",").map(Number);
const scripts = opt("scripts", "screens").split(",");
const W = 1440;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ["editor-page", "?demo=1#/editordemo", 1200],
  ["capture", "?demo=1#/capture", 800],
  ["tray", "?demo=1#/tray", 800],
  ["settings-appearance", "?demo=1#/settings/appearance", 800],
];

async function startVite() {
  const given = opt("url", "");
  if (given) return { url: given, stop: () => {} };
  const proc = spawn("npx", ["vite", "--port", "1420", "--strictPort"], { cwd: root, stdio: "ignore" });
  const url = "http://127.0.0.1:1420";
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try {
      if ((await fetch(url)).ok) return { url, stop: () => proc.kill() };
    } catch {
      // Vite is still starting.
    }
  }
  proc.kill();
  throw new Error("Vite did not start on 1420 (is another dev server using the port?)");
}

async function snap(cdp, name, scale) {
  const suffix = scale === 1 ? "" : `@${Math.round(scale * 100)}`;
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(out, `${name}${suffix}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}${suffix}.png`);
}

// The director's stills arrive through one CDP binding; `active` says which run they belong to.
const active = { script: "screens", scale: 1 };

function listenForShots(cdp, shots) {
  cdp.on("Runtime.bindingCalled", (p) => {
    if (p.name !== "__demoShot") return;
    const name = active.script === "screens" ? p.payload : `${active.script}-${p.payload}`;
    shots.push(
      (async () => {
        await sleep(120);
        await snap(cdp, name, active.scale);
        await cdp.eval("window.__demoShotAck && window.__demoShotAck()");
      })(),
    );
  });
}

async function runDirector(cdp, url, scale, script, shots) {
  Object.assign(active, { script, scale });
  await cdp.send("Page.navigate", { url: `${url}/?demo=1&script=${script}#/notch` });
  const done = await cdp.waitFor("window.__demoDone === true", 90000);
  await Promise.all(shots.splice(0));
  if (!done) throw new Error(`the ${script} director did not finish within 90 s`);
}

async function main() {
  mkdirSync(out, { recursive: true });
  const vite = await startVite();
  const cdp = await launchChrome({ width: W, height: H });
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Runtime.addBinding", { name: "__demoShot" });
    const shots = [];
    listenForShots(cdp, shots);
    for (const scale of scales) {
      console.log(`scale ${scale}`);
      await setViewport(cdp, W, H, scale);
      for (const script of scripts) await runDirector(cdp, vite.url, scale, script, shots);
      for (const [name, query, settle] of PAGES) {
        await cdp.send("Page.navigate", { url: `${vite.url}/${query}` });
        await sleep(settle);
        await snap(cdp, name, scale);
      }
    }
  } finally {
    cdp.close();
    vite.stop();
  }
  console.log(`done: ${out}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
