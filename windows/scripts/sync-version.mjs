// Reads the repo-root VERSION ("0.10.0 (2)") and writes the marketing
// version into package.json and src-tauri/tauri.conf.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const raw = readFileSync(join(root, "..", "VERSION"), "utf8").trim();
const marketing = raw.split(/\s+/)[0];
if (!/^\d+\.\d+\.\d+$/.test(marketing)) throw new Error(`Bad VERSION: ${raw}`);

for (const rel of ["package.json", "src-tauri/tauri.conf.json"]) {
  const p = join(root, rel);
  const json = JSON.parse(readFileSync(p, "utf8"));
  json.version = marketing;
  writeFileSync(p, JSON.stringify(json, null, 2) + "\n");
}
console.log(`version ${marketing}`);
