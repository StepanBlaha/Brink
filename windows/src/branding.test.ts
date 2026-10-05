import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const repoVersion = readFileSync(join(root, "..", "VERSION"), "utf8").trim().split(/\s+/)[0];

describe("version parity (BrandingTests)", () => {
  it("package.json matches VERSION", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.version).toBe(repoVersion);
  });
  it("tauri.conf.json matches VERSION", () => {
    const conf = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
    expect(conf.version).toBe(repoVersion);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(name)) out.push(p);
  }
  return out;
}

describe("no em dash in UI copy", () => {
  it("src/**/*.{ts,tsx,json} contains no U+2014", () => {
    const emDash = String.fromCharCode(0x2014);
    const offenders = walk(join(root, "src")).filter((f) =>
      readFileSync(f, "utf8").includes(emDash),
    );
    expect(offenders).toEqual([]);
  });
});
