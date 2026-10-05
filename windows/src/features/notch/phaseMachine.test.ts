import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhaseMachine, type PhaseState, type Zones } from "./phaseMachine";

const away: Zones = { resting: false, strip: false, peek: false };
const inResting: Zones = { resting: true, strip: false, peek: false };
const inStrip: Zones = { resting: true, strip: true, peek: false };

let m: PhaseMachine;
let states: PhaseState[];
let blocked = false;

beforeEach(() => {
  vi.useFakeTimers();
  states = [];
  blocked = false;
  m = new PhaseMachine({ onChange: (s) => states.push(s), isBlocked: () => blocked });
});
afterEach(() => {
  m.dispose();
  vi.useRealTimers();
});

describe("phase machine", () => {
  it("hover-in is immediate", () => {
    m.pointerMoved(inResting);
    expect(m.state.phase).toBe("strip");
  });

  it("hover-out folds after 350 ms, not at 300 ms", () => {
    m.pointerMoved(inResting);
    m.pointerMoved(away);
    vi.advanceTimersByTime(300);
    expect(m.state.phase).toBe("strip");
    vi.advanceTimersByTime(49);
    expect(m.state.phase).toBe("strip");
    vi.advanceTimersByTime(1);
    expect(m.state.phase).toBe("resting");
  });

  it("re-entry cancels the pending collapse", () => {
    m.pointerMoved(inResting);
    m.pointerMoved(away);
    vi.advanceTimersByTime(200);
    m.pointerMoved(inStrip);
    vi.advanceTimersByTime(1000);
    expect(m.state.phase).toBe("strip");
  });

  it("a menu open blocks the fold", () => {
    m.pointerMoved(inResting);
    blocked = true;
    m.pointerMoved(away);
    vi.advanceTimersByTime(1000);
    expect(m.state.phase).toBe("strip");
  });

  it("clicking a pin expands; same pin again toggles closed", () => {
    m.pointerMoved(inStrip);
    m.selectPin("a");
    expect(m.state).toMatchObject({ phase: "expanded", selectedPinId: "a" });
    m.selectPin("b");
    expect(m.state).toMatchObject({ phase: "expanded", selectedPinId: "b" });
    m.selectPin("b");
    expect(m.state.phase).toBe("strip");
  });

  it("collapse returns to resting when the cursor is outside the strip", () => {
    m.pointerMoved(inStrip);
    m.selectPin("a");
    m.pointerMoved(away);
    m.collapse(true);
    expect(m.state.phase).toBe("resting");
  });

  it("keep open ignores outside click and Esc, force still collapses", () => {
    m.selectPin("a");
    m.toggleKeepOpen();
    m.outsideClick();
    m.escape();
    expect(m.state.phase).toBe("expanded");
    m.collapse(true);
    expect(m.state.phase).toBe("resting");
    expect(m.state.keepOpen).toBe(false);
  });

  it("outside click and Esc collapse", () => {
    m.selectPin("a");
    m.outsideClick();
    expect(m.state.phase).toBe("resting");
    m.selectPin("a");
    m.escape();
    expect(m.state.phase).toBe("resting");
  });

  it("mouse moves never leave expanded", () => {
    m.selectPin("a");
    m.pointerMoved(away);
    vi.advanceTimersByTime(5000);
    expect(m.state.phase).toBe("expanded");
  });

  it("non-expanded phases clear selection and add flow", () => {
    m.openAddFlow();
    expect(m.state.addFlow).toBe(true);
    m.collapse(true);
    expect(m.state).toMatchObject({ selectedPinId: null, addFlow: false });
  });

  it("layout change folds expanded to resting", () => {
    m.selectPin("a");
    m.layoutChanged();
    expect(m.state.phase).toBe("resting");
  });
});

describe("peek", () => {
  beforeEach(() => m.pointerMoved(inStrip));

  it("shows after 0.5 s dwell, not before", () => {
    m.peekEnter("a");
    vi.advanceTimersByTime(499);
    expect(m.state.peekPinId).toBeNull();
    vi.advanceTimersByTime(1);
    expect(m.state.peekPinId).toBe("a");
  });

  it("leaving before the dwell cancels", () => {
    m.peekEnter("a");
    vi.advanceTimersByTime(300);
    m.peekLeave();
    vi.advanceTimersByTime(1000);
    expect(m.state.peekPinId).toBeNull();
  });

  it("dismisses 0.3 s after leaving, unless the card is hovered", () => {
    m.peekEnter("a");
    vi.advanceTimersByTime(500);
    m.peekLeave();
    m.peekCardHover(true);
    vi.advanceTimersByTime(1000);
    expect(m.state.peekPinId).toBe("a");
    m.peekCardHover(false);
    vi.advanceTimersByTime(299);
    expect(m.state.peekPinId).toBe("a");
    vi.advanceTimersByTime(1);
    expect(m.state.peekPinId).toBeNull();
  });

  it("clicking an icon clears the peek and selects", () => {
    m.peekEnter("a");
    vi.advanceTimersByTime(500);
    m.selectPin("a");
    expect(m.state).toMatchObject({ phase: "expanded", peekPinId: null });
  });

  it("no peek outside the strip phase", () => {
    m.selectPin("a");
    m.peekEnter("b");
    vi.advanceTimersByTime(1000);
    expect(m.state.peekPinId).toBeNull();
  });
});

describe("reminder peek", () => {
  it("unfolds the strip, peeks the pin for 3 s, then folds back", () => {
    m.reminderPeek("p1");
    expect(m.state.phase).toBe("strip");
    expect(m.state.peekPinId).toBeNull();
    vi.advanceTimersByTime(150);
    expect(m.state.peekPinId).toBe("p1");
    m.pointerMoved(away); // the pointer events must not fold it early
    vi.advanceTimersByTime(2990);
    expect(m.state.peekPinId).toBe("p1");
    expect(m.state.phase).toBe("strip");
    vi.advanceTimersByTime(20);
    expect(m.state.peekPinId).toBeNull();
    expect(m.state.phase).toBe("resting");
  });

  it("stays in the strip when the cursor is there", () => {
    m.pointerMoved(inStrip);
    m.reminderPeek("p1");
    vi.advanceTimersByTime(3200);
    expect(m.state.peekPinId).toBeNull();
    expect(m.state.phase).toBe("strip");
  });

  it("does nothing while a panel is open, and a click cancels it", () => {
    m.selectPin("a");
    m.reminderPeek("p1");
    vi.advanceTimersByTime(4000);
    expect(m.state).toMatchObject({ phase: "expanded", selectedPinId: "a", peekPinId: null });
    m.collapse(true);
    m.reminderPeek("p1");
    m.selectPin("b");
    vi.advanceTimersByTime(4000);
    expect(m.state).toMatchObject({ phase: "expanded", selectedPinId: "b", peekPinId: null });
  });
});
