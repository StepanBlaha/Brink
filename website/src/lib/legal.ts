import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

/** Repo-level legal/ folder (single source of truth), read at build time. */
const LEGAL_DIR = path.resolve(process.cwd(), "..", "legal");

export type LegalFile = "PRIVACY.md" | "TERMS.md" | "NOTICE.md";

export async function renderLegal(file: LegalFile): Promise<string> {
  const md = await readFile(path.join(LEGAL_DIR, file), "utf8");
  // The page renders its own <h1>, so drop the Markdown one.
  const body = md.replace(/^# .*\n+/, "");
  const html = await marked.parse(body, { gfm: true });
  return html.replace(/<a href="(https?:)/g, '<a rel="noopener" href="$1');
}
