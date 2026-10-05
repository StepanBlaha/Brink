import { defaultCalloutIcon, K, type ParagraphKind } from "./paragraphKind";

export const softBreak = " ";
export const attachmentCharacter = "￼";
export const maxDepth = 3;

export interface Parsed {
  depth: number;
  kind: ParagraphKind;
  content: string;
  /** UTF-16 length of the leading tabs. */
  indentLength: number;
  /** UTF-16 length of the kind marker after the tabs. */
  markerLength: number;
}

/** Notion's accepted code-block languages. */
export const notionLanguages: ReadonlySet<string> = new Set([
  "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash", "basic", "bnf", "c", "c#", "c++",
  "clojure", "coffeescript", "coq", "css", "dart", "dhall", "diff", "docker", "ebnf", "elixir", "elm",
  "erlang", "f#", "flow", "fortran", "gherkin", "glsl", "go", "graphql", "groovy", "haskell", "hcl",
  "html", "idris", "java", "javascript", "json", "julia", "kotlin", "latex", "less", "lisp",
  "livescript", "llvm ir", "lua", "makefile", "markdown", "markup", "matlab", "mathematica", "mermaid",
  "nix", "notion formula", "objective-c", "ocaml", "pascal", "perl", "php", "plain text", "powershell",
  "prolog", "protobuf", "purescript", "python", "r", "racket", "reason", "ruby", "rust", "sass", "scala",
  "scheme", "scss", "shell", "smalltalk", "solidity", "sql", "swift", "toml", "typescript", "vb.net",
  "verilog", "vhdl", "visual basic", "webassembly", "xml", "yaml", "java/c/c++/c#",
]);

const languageAliases: Record<string, string> = {
  "": "plain text", text: "plain text", plain: "plain text", txt: "plain text",
  js: "javascript", ts: "typescript", py: "python", sh: "shell", zsh: "shell",
  yml: "yaml", objc: "objective-c", md: "markdown", rb: "ruby", kt: "kotlin",
  cpp: "c++", cs: "c#", csharp: "c#", rs: "rust", golang: "go", dockerfile: "docker",
};

/** Canonical language; unknown names are kept verbatim. */
export function normalizeLanguage(raw: string): string {
  const trimmed = raw.replace(/^[ \t]+|[ \t]+$/g, "");
  const lower = trimmed.toLowerCase();
  const alias = Object.hasOwn(languageAliases, lower) ? languageAliases[lower] : undefined;
  if (alias !== undefined) return alias;
  if (notionLanguages.has(lower)) return lower;
  return trimmed;
}

/** A language Notion will accept for a write. */
export function sendableLanguage(language: string): string {
  const n = normalizeLanguage(language);
  return notionLanguages.has(n) ? n : "plain text";
}

export const toSoftBreaks = (s: string): string => s.replace(/\r\n|\n|\r/g, softBreak);
export const fromSoftBreaks = (s: string): string => s.split(softBreak).join("\n");

const prefixes: [string, ParagraphKind][] = [
  ["### ", K.heading3], ["## ", K.heading2], ["# ", K.heading1],
  ["- [ ] ", K.toDo(false)], ["- [x] ", K.toDo(true)], ["- [X] ", K.toDo(true)],
  ["- ", K.bulleted], ["* ", K.bulleted], ["!> ", K.callout(defaultCalloutIcon)],
  ["+ ", K.toggle], ["> ", K.quote],
];

function numberedMarkerLength(text: string): number | undefined {
  const m = /^[0-9]{1,9}\. /.exec(text);
  return m ? m[0].length : undefined;
}

export function parse(text: string): Parsed {
  let rest = text;
  let tabs = 0;
  while (rest.startsWith("\t")) { rest = rest.slice(1); tabs++; }
  const depth = Math.min(tabs, maxDepth);
  const make = (kind: ParagraphKind, marker: number, content: string): Parsed => ({
    depth, kind, content: fromSoftBreaks(content), indentLength: tabs, markerLength: marker,
  });
  if (rest.startsWith("\\")) return make(K.paragraph, 1, rest.slice(1));
  if (rest.startsWith("```")) {
    const sep = rest.indexOf(softBreak);
    if (sep >= 0) return make(K.code(normalizeLanguage(rest.slice(3, sep))), sep + 1, rest.slice(sep + 1));
  }
  if (rest === "---") return make(K.divider, 3, "");
  for (const [prefix, kind] of prefixes) {
    if (rest.startsWith(prefix)) return make(kind, prefix.length, rest.slice(prefix.length));
  }
  const nm = numberedMarkerLength(rest);
  if (nm !== undefined) return make(K.numbered, nm, rest.slice(nm));
  return make(K.paragraph, 0, rest);
}

/** A paragraph's content needs a leading "\" when it would parse as another kind. */
export function needsEscape(content: string): boolean {
  if (content.startsWith("\\") || content.startsWith("\t")) return true;
  const p = parse(toSoftBreaks(content));
  return p.kind.t !== "paragraph" || p.markerLength !== 0;
}

/** The paragraph text for a block (`number` only used for numbered). */
export function render(kind: ParagraphKind, content: string, depth: number, number = 1): string {
  const indent = "\t".repeat(Math.max(0, Math.min(depth, maxDepth)));
  const body = toSoftBreaks(content);
  switch (kind.t) {
    case "paragraph": return indent + (needsEscape(content) ? "\\" + body : body);
    case "heading1": return `${indent}# ${body}`;
    case "heading2": return `${indent}## ${body}`;
    case "heading3": return `${indent}### ${body}`;
    case "bulleted": return `${indent}- ${body}`;
    case "numbered": return `${indent}${number}. ${body}`;
    case "toDo": return `${indent}${kind.checked ? "- [x] " : "- [ ] "}${body}`;
    case "quote": return `${indent}> ${body}`;
    case "code": return `${indent}\`\`\`${kind.language === "plain text" ? "" : kind.language}${softBreak}${body}`;
    case "divider": return `${indent}---`;
    case "toggle": return `${indent}+ ${body}`;
    case "callout": return `${indent}!> ${body}`;
    case "token":
    case "image": return indent + attachmentCharacter;
  }
}
