import type { PinItem } from "../strip/pinItems";
import type { FakePin } from "./fakePins";

/** Panel and Peek still take the M2 display shape; summaries and rows arrive with M4 and M6. */
export function toPanelPin(item: PinItem): FakePin {
  const icon = item.icon.kind === "emoji" ? item.icon.value : item.icon.kind === "letter" ? item.icon.text : "◆";
  return { id: item.id, title: item.title, icon, isToday: item.isToday, open: 0, total: 0, next: [] };
}
