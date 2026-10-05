import type { Operation } from "../notion/pendingWrite";
import { formattedBlock } from "../notion/newBlock";
import type { PropertyUpdate } from "../notion/propertyValue";
import type { Pin } from "../store/pin";
import { captureMarkdown, type MarkdownPort } from "./captureMarkdown";
import { isoString, parseNaturalDate } from "./naturalDate";

export interface CapturePlan {
  operation: Operation;
  /** The title/text actually saved (date phrase stripped for databases). */
  savedText: string;
}

/**
 * Maps quick-capture input plus a destination pin to the queued write that saves it.
 * `dateProperty` is the destination database's date property; `null` disables date parsing.
 */
export function planCapture(
  text: string,
  pin: Pin,
  dateProperty: string | null,
  now: Date = new Date(),
  md: MarkdownPort = captureMarkdown,
): CapturePlan | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (pin.kind === "page") {
    const block = md.detectPrefixedBlock(trimmed) ?? {
      ...formattedBlock("toDo", "", { checked: false }),
      richText: md.spans(trimmed),
    };
    return { operation: { kind: "appendBlock", parentId: pin.notionId, block }, savedText: trimmed };
  }
  let title = trimmed;
  let extra: PropertyUpdate[] = [];
  if (dateProperty !== null) {
    const parsed = parseNaturalDate(trimmed, now);
    if (parsed.date) {
      title = parsed.cleanTitle;
      const start = isoString(parsed.date, parsed.hasTime);
      extra = [{ name: dateProperty, value: { type: "date", date: { start } } }];
    }
  }
  return { operation: { kind: "createRow", dataSourceId: pin.notionId, title, extra }, savedText: title };
}
