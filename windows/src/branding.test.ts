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

/** Quoted string literals and JSX text of a source file, comments removed. */
function copyOf(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  for (const m of code.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) out.push(m[1] ?? "");
  return out;
}

describe("brand voice: no exclamation marks in copy", () => {
  it("string literals and JSX text in src (tests excluded) have no sentence-ending '!'", () => {
    const files = walk(join(root, "src")).filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith(".json"));
    const offenders: string[] = [];
    for (const f of files) {
      for (const text of copyOf(readFileSync(f, "utf8"))) {
        if (/[\p{L}\p{N}.)"'?]!(\s|$)/u.test(text) || /^\s*!\s*$/.test(text)) offenders.push(`${f}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the scanner finds a violation in a sample", () => {
    expect(copyOf(`const a = "Saved!";`).some((t) => /[\p{L}]!(\s|$)/u.test(t))).toBe(true);
    expect(copyOf(`<p>Hello there!</p>`).some((t) => /[\p{L}]!(\s|$)/u.test(t))).toBe(true);
    expect(copyOf(`if (a !== b) {}`).some((t) => /[\p{L}]!(\s|$)/u.test(t))).toBe(false);
  });

  it("Rust UI strings (src-tauri/src) contain no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    const rs: string[] = [];
    const rwalk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) rwalk(p);
        else if (n.endsWith(".rs")) rs.push(p);
      }
    };
    rwalk(join(root, "src-tauri", "src"));
    expect(rs.filter((f) => readFileSync(f, "utf8").includes(emDash))).toEqual([]);
  });
});
