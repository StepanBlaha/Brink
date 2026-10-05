/** English + Czech word tables for natural dates. Lookups are lowercase. Weekday numbers: 1 = Sunday ... 7 = Saturday. */
export const weekdays: Record<string, number> = {
  sunday: 1, "neděle": 1, nedele: 1, "neděli": 1, nedeli: 1,
  monday: 2, "pondělí": 2, pondeli: 2, "pondělka": 2,
  tuesday: 3, tue: 3, tues: 3, "úterý": 3, utery: 3, "úterka": 3,
  wednesday: 4, "středa": 4, streda: 4, "středu": 4, stredu: 4, "středy": 4,
  thursday: 5, thu: 5, thur: 5, thurs: 5, "čtvrtek": 5, ctvrtek: 5, "čtvrtka": 5,
  friday: 6, fri: 6, "pátek": 6, patek: 6, "pátku": 6, patku: 6,
  saturday: 7, sobota: 7, sobotu: 7, soboty: 7,
};

export const months: Record<string, number> = {
  january: 1, jan: 1, ledna: 1, leden: 1,
  february: 2, feb: 2, "února": 2, unora: 2, "únor": 2, unor: 2,
  march: 3, mar: 3, "března": 3, brezna: 3, "březen": 3, brezen: 3,
  april: 4, apr: 4, dubna: 4, duben: 4,
  may: 5, "května": 5, kvetna: 5, "květen": 5, kveten: 5,
  june: 6, jun: 6, "června": 6, cervna: 6, "červen": 6, cerven: 6,
  july: 7, jul: 7, "července": 7, cervence: 7, "červenec": 7, cervenec: 7,
  august: 8, aug: 8, srpna: 8, srpen: 8,
  september: 9, sept: 9, sep: 9, "září": 9, zari: 9,
  october: 10, oct: 10, "října": 10, rijna: 10, "říjen": 10, rijen: 10,
  november: 11, nov: 11, listopadu: 11, listopad: 11,
  december: 12, dec: 12, prosince: 12, prosinec: 12,
};

export type Unit = "hour" | "day" | "week" | "month";

/** Unit keyword to calendar unit for "in N <unit>" / "za N <unit>". */
export const units: Record<string, Unit> = {
  hour: "hour", hours: "hour", hr: "hour", hrs: "hour", h: "hour",
  hodinu: "hour", hodiny: "hour", hodin: "hour",
  day: "day", days: "day", den: "day", dny: "day", "dní": "day", dni: "day", "dnů": "day", dnu: "day",
  week: "week", weeks: "week", "týden": "week", tyden: "week",
  "týdny": "week", tydny: "week", "týdnů": "week", tydnu: "week",
  month: "month", months: "month", "měsíc": "month", mesic: "month",
  "měsíce": "month", mesice: "month", "měsíců": "month", mesicu: "month",
};

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Longest words first so "tuesday" wins over "tue". */
export function alternation(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length).map(escape).join("|");
}
