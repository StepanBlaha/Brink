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
    answer: "A Mac running macOS 14 or later, and a Notion internal integration. You create the integration yourself in Notion, paste its token into Brink, and share the pages you want with it. Not seeing a page? Share it with your integration in Notion.",
    content: <>A Mac running macOS 14 or later, and a Notion internal integration. You create the integration yourself in Notion, paste its token into Brink, and share the pages you want with it. Not seeing a page? Share it with your integration in Notion.</>,
  },
  {
    question: "Does it work offline?",
    answer: "Yes, for what you have already opened. Pages are cached so the panel opens instantly, and edits made offline are queued and synced when you are back online.",
    content: <>Yes, for what you have already opened. Pages are cached so the panel opens instantly, and edits made offline are queued and synced when you are back online.</>,
  },
  {
    question: "Where does my data go?",
    answer: "Only between your Mac and Notion. The token is stored in the macOS Keychain, and there is no server, analytics or tracking.",
    content: <>Only between your Mac and Notion. The token is stored in the macOS Keychain, and there is no server, analytics or tracking.</>,
  },
  {
    question: "How much does it cost?",
    answer: "Brink is free. Download the latest version from GitHub Releases.",
    content: <>Brink is free. Download the latest version from <a href={site.downloadUrl}>GitHub Releases</a>.</>,
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
    answer: "Choose Remove token in Brink’s settings, or remove the integration in Notion under Settings → Connections. Brink loses access immediately.",
    content: <>Choose Remove token in Brink&rsquo;s settings, or remove the integration in Notion under Settings &rarr; Connections. Brink loses access immediately.</>,
  },
];
