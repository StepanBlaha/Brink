export interface PinItem {
  id: string;
  text: string;
}

export interface Pin {
  id: string;
  icon: string;
  title: string;
  items: PinItem[];
}

export const pins: Pin[] = [
  {
    id: "groceries", icon: "🛒", title: "Groceries",
    items: [
      { id: "g1", text: "Oat milk" }, { id: "g2", text: "Sourdough loaf" },
      { id: "g3", text: "Lemons" }, { id: "g4", text: "Coffee beans" },
    ],
  },
  {
    id: "launch", icon: "🚀", title: "Launch plan",
    items: [
      { id: "l1", text: "Record demo clips" }, { id: "l2", text: "Write release notes" },
      { id: "l3", text: "Tag v1.0" }, { id: "l4", text: "Post to Product Hunt" },
    ],
  },
  {
    id: "training", icon: "🏃", title: "Training",
    items: [
      { id: "t1", text: "Easy 5 km run" }, { id: "t2", text: "Mobility, 15 min" },
      { id: "t3", text: "Long run Sunday" }, { id: "t4", text: "Book physio" },
    ],
  },
  {
    id: "reading", icon: "📚", title: "Reading",
    items: [
      { id: "r1", text: "Finish chapter 6" }, { id: "r2", text: "Highlights to notes" },
      { id: "r3", text: "Order the sequel" }, { id: "r4", text: "Return library book" },
    ],
  },
];
