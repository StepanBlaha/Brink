import { K, type ParagraphKind } from "./paragraphKind";

export const slashCommands = [
  "text", "heading1", "heading2", "heading3", "toDo", "bulleted", "numbered", "quote", "code", "divider", "toggle", "callout",
] as const;
export type SlashCommand = (typeof slashCommands)[number];

const titles: Record<SlashCommand, string> = {
  text: "Text", heading1: "Heading 1", heading2: "Heading 2", heading3: "Heading 3", toDo: "To-do",
  bulleted: "Bulleted list", numbered: "Numbered list", quote: "Quote", code: "Code", divider: "Divider",
  toggle: "Toggle", callout: "Callout",
};

const keywords: Record<SlashCommand, string[]> = {
  text: ["paragraph", "plain"], heading1: ["h1", "title"], heading2: ["h2", "subtitle"], heading3: ["h3"],
  toDo: ["todo", "task", "checkbox"], bulleted: ["bullet", "ul", "list"], numbered: ["number", "ol", "list"],
  quote: ["blockquote"], code: ["codeblock", "snippet"], divider: ["hr", "line", "separator"],
  toggle: ["collapse", "details", "disclosure"], callout: ["note", "info", "tip"],
};

export const slashTitle = (c: SlashCommand): string => titles[c];

function isSubsequence(needle: string, haystack: string): boolean {
  let pos = 0;
  for (const ch of needle) {
    const at = haystack.indexOf(ch, pos);
    if (at < 0) return false;
    pos = at + 1;
  }
  return true;
}

/** Fuzzy prefix match, best first; ties keep menu order. */
export function matching(query: string): SlashCommand[] {
  const q = query.toLowerCase().replace(/^[ \t]+|[ \t]+$/g, "");
  if (q === "") return [...slashCommands];
  const scored: { c: SlashCommand; score: number; order: number }[] = [];
  slashCommands.forEach((c, order) => {
    const title = titles[c].toLowerCase();
    const compact = title.replace(/ /g, "").replace(/-/g, "");
    const words = title.split(/[ -]/).filter((w) => w !== "");
    let score: number | undefined;
    if (title.startsWith(q) || compact.startsWith(q)) score = 0;
    else if (words.some((w) => w.startsWith(q))) score = 1;
    else if (keywords[c].some((k) => k.startsWith(q))) score = 2;
    else if (q[0] === compact[0] && isSubsequence(q, compact)) score = 3;
    if (score !== undefined) scored.push({ c, score, order });
  });
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).map((s) => s.c);
}

/** The kind a block of `current` kind becomes (callouts keep their icon, code its language). */
export function slashKind(c: SlashCommand, current: ParagraphKind): ParagraphKind {
  switch (c) {
    case "text": return K.paragraph;
    case "heading1": return K.heading1;
    case "heading2": return K.heading2;
    case "heading3": return K.heading3;
    case "toDo": return K.toDo(false);
    case "bulleted": return K.bulleted;
    case "numbered": return K.numbered;
    case "quote": return K.quote;
    case "code": return current.t === "code" ? current : K.code("plain text");
    case "divider": return K.divider;
    case "toggle": return K.toggle;
    case "callout": return current.t === "callout" ? current : K.callout();
  }
}
