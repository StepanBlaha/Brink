import { PageHost } from "./PageHost";
import { FakeNotionServer } from "../test/fakeNotion";
import styles from "./editor.module.css";

const server = new FakeNotionServer();
server.seed("demo-page", [
  { id: "h1", type: "heading_1", text: "Launch notes" },
  { id: "p1", type: "paragraph", text: "Ship the **beta** this week, see [the plan](https://example.com)." },
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
        <PageHost pageId="demo-page" api={server.api()} onOpenToken={() => {}} />
      </div>
    </div>
  );
}
