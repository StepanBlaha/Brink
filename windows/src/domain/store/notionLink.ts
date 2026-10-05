/** Links to a Notion page (port of NotionLink). Pure; the Rust `open_in_notion` picks app or web itself. */

/** A Notion id without dashes, as used in notion.so URLs. */
export const compactID = (id: string): string => id.replaceAll("-", "");

export const appURL = (id: string): string => `notion://www.notion.so/${compactID(id)}`;

export const webURL = (id: string): string => `https://www.notion.so/${compactID(id)}`;

/** notion:// when the Notion app is installed, otherwise https. */
export const preferredURL = (id: string, appInstalled: boolean): string => (appInstalled ? appURL(id) : webURL(id));
