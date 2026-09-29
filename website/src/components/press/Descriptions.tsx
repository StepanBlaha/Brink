import { site } from "@/site";

export function Descriptions() {
  return (
    <>
      <h2>Taglines</h2>
      <ul>
        {site.taglines.map((t, i) => (
          <li key={t}>{i === 0 ? <><strong>Primary:</strong> {t}</> : t}</li>
        ))}
      </ul>

      <h2>Short description</h2>
      <p>Brink is a black notch on your Mac&rsquo;s screen edge that keeps your Notion pages and tasks one hover away.</p>
      <h2>Long description</h2>
      <p>
        Brink is a native macOS app that turns the edge of your screen into a fast lane to your Notion workspace. A quiet black pill rests on the edge; hover to unfold a strip of your pinned pages, click to open a Notion-style panel where you can check off tasks, edit text and add items. A global hotkey (&#8997;&#8679;Space) captures tasks from any app with natural dates in English and Czech. Brink also offers badges, a menu-bar mini-list, a desktop widget and a share extension. It works with Notion through the public Notion API. Your data stays between your Mac and Notion, with no tracking. Requires macOS 14 or later and a Notion internal integration.
      </p>
    </>
  );
}
