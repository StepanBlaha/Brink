import type { ReactNode } from "react";
import { site } from "@/site";

export interface FaqItem {
  question: string;
  /** Plain-text answer, used for FAQPage JSON-LD. */
  answer: string;
  /** Rich answer rendered on the page. */
  content: ReactNode;
}

export const faq: FaqItem[] = [
  {
    question: "Is Brink an official Notion app?",
    answer: `No. ${site.disclaimer} It works with Notion through the public Notion API.`,
    content: <>No. Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc. It works with Notion through the public Notion API.</>,
  },
  {
    question: "What do I need to run it?",
    answer: "A Mac running macOS 14 or later and a Notion account. Click Connect to Notion and pick the pages Brink may use. If you prefer, you can paste an internal integration token instead.",
    content: <>A Mac running macOS 14 or later and a Notion account. Click Connect to Notion and pick the pages Brink may use. If you prefer, you can paste an internal integration token instead.</>,
  },
  {
    question: "How does connecting to Notion work?",
    answer: "Connect to Notion opens Notion’s own consent screen in your browser. You choose exactly which pages and databases Brink can see, then click Allow. Notion needs a secret to finish sign-in that can’t safely ship inside an app, so a tiny relay run by the developer swaps Notion’s one-time code for your access token. It stores and logs nothing and never sees your pages. The token is saved in your Mac’s Keychain. To add pages later, connect again and update your selection. Advanced users can paste an internal integration token instead, which skips the relay.",
    content: <>Connect to Notion opens Notion&rsquo;s own consent screen in your browser. You choose exactly which pages and databases Brink can see, then click Allow. Notion needs a secret to finish sign-in that can&rsquo;t safely ship inside an app, so a tiny relay run by the developer swaps Notion&rsquo;s one-time code for your access token. It stores and logs nothing and never sees your pages. The token is saved in your Mac&rsquo;s Keychain. To add pages later, connect again and update your selection. Advanced users can paste an internal integration token instead, which skips the relay.</>,
  },
  {
    question: "Does it work offline?",
    answer: "Yes, for what you have already opened. Pages are cached so the panel opens instantly, and edits made offline are queued and synced when you are back online.",
    content: <>Yes, for what you have already opened. Pages are cached so the panel opens instantly, and edits made offline are queued and synced when you are back online.</>,
  },
  {
    question: "Where does my data go?",
    answer: "Only between your Mac and Notion. The token is stored in the macOS Keychain. There’s no analytics or tracking, and apart from the sign-in relay (which stores nothing), there’s no server.",
    content: <>Only between your Mac and Notion. The token is stored in the macOS Keychain. There&rsquo;s no analytics or tracking, and apart from the sign-in relay (which stores nothing), there&rsquo;s no server.</>,
  },
  {
    question: "How much does it cost?",
    answer: "Brink is free. Download the latest version from GitHub Releases.",
    content: <>Brink is free. Download the latest version from <a href={site.downloadUrl}>GitHub Releases</a>.</>,
  },
  {
    question: "Does Brink work on Windows?",
    answer: "Coming soon. A Windows 10 (22H2) and Windows 11 version for x64 and ARM64 is built and in testing. It will be free, with the same notch, hotkeys and Notion editing. Watch GitHub Releases for the launch.",
    content: <>Coming soon. A Windows 10 (22H2) and Windows 11 version for x64 and ARM64 is built and in testing. It will be free, with the same notch, hotkeys and Notion editing. Watch <a href={site.releasesUrl}>GitHub Releases</a> for the launch.</>,
  },
  {
    question: "Does it work on external displays and notched MacBooks?",
    answer: "Yes. Choose the edge (left, right or top) and the display in Settings. On a MacBook with a camera notch, Brink sits on the edge you pick, not over the camera.",
    content: <>Yes. Choose the edge (left, right or top) and the display in Settings. On a MacBook with a camera notch, Brink sits on the edge you pick, not over the camera.</>,
  },
  {
    question: "Can I add tasks without opening Notion?",
    answer: "Yes. Press Option-Shift-Space anywhere, type your task with a natural date such as “tomorrow 5pm”, and it is saved to the database you chose.",
    content: <>Yes. Press <kbd>&#8997;&#8679;Space</kbd> anywhere, type your task with a natural date such as &ldquo;tomorrow 5pm&rdquo;, and it is saved to the database you chose.</>,
  },
  {
    question: "How do I remove Brink’s access?",
    answer: "Choose Disconnect in Brink’s settings, or remove Brink in Notion under Settings → Connections. Brink loses access immediately.",
    content: <>Choose Disconnect in Brink&rsquo;s settings, or remove Brink in Notion under Settings &rarr; Connections. Brink loses access immediately.</>,
  },
];
