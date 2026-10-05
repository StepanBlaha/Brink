import { createFake, sprintRow } from "../features/database/fakePorts";
import { PageHost } from "./PageHost";
import { FakeNotionServer } from "../test/fakeNotion";
import styles from "./editor.module.css";

const svg = (a: string, b: string, w: number, h: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`)}`;
const dbFake = createFake(Array.from({ length: 11 }, (_, i) => sprintRow(`r${i}`, ["Fix login redirect", "Write release notes", "Review pull requests", "Update dependencies", "Plan next sprint", "Record the demo", "Publish", "Back up the database", "Triage bugs", "Reply to feedback", "Tidy the roadmap"][i]!)));
const server = new FakeNotionServer();
server.seedPage("demo-page", { object: "page", id: "demo-page", cover: { type: "external", external: { url: "https://demo.invalid/cover.svg" } } });
server.seed("demo-page", [
  { id: "h1", type: "heading_1", text: "Launch notes" },
  { id: "p1", type: "paragraph", extra: { rich_text: [
    { type: "text", text: { content: "Ship the " }, plain_text: "Ship the " },
    { type: "text", text: { content: "beta" }, plain_text: "beta", annotations: { bold: true } },
    { type: "text", text: { content: " this week, see " }, plain_text: " this week, see " },
    { type: "text", text: { content: "the plan", link: { url: "https://example.com" } }, plain_text: "the plan", href: "https://example.com" },
    { type: "text", text: { content: "." }, plain_text: "." },
  ] } },
  { id: "t1", type: "to_do", text: "Write the changelog", extra: { checked: true } },
  { id: "t2", type: "to_do", text: "Invite the first 50 users", extra: { checked: false } },
  { id: "h2", type: "heading_2", text: "Next" },
  { id: "b1", type: "bulleted_list_item", text: "Fix the login redirect" },
  { id: "n1", type: "numbered_list_item", text: "Record the demo" },
  { id: "n2", type: "numbered_list_item", text: "Publish" },
  { id: "q1", type: "quote", text: "Make it feel instant." },
  { id: "tg", type: "toggle", text: "Open questions" },
  { id: "co", type: "callout", text: "Remember to back up the database.", extra: { icon: { type: "emoji", emoji: "💡" } } },
  { id: "k1", type: "code", text: "const beta = true;", extra: { language: "typescript" } },
  { id: "im", type: "image", text: null, extra: { type: "external", external: { url: svg("#0a84ff", "#bf5af2", 640, 360) } } },
  { id: "dv", type: "divider", text: null },
  { id: "db", type: "child_database", text: null, extra: { title: "Tasks" } },
  { id: "e1", type: "paragraph", text: "" },
]);
server.seed("tg", [{ id: "tc", type: "paragraph", text: "Do we need an offline mode?" }]);

/** Browser-only page (`#/editordemo`): the editor on the fake Notion server. */
export function EditorDemo() {
  return (
    <div className={styles.stage}>
      <div className={styles.demoPanel}>
        <PageHost pageId="demo-page" api={server.api()} onOpenToken={() => {}} dbPorts={dbFake.ports} resolveCover={() => Promise.resolve(svg("#ff9f0a", "#0a84ff", 880, 112))} />
      </div>
    </div>
  );
}
