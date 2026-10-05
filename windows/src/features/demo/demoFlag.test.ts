import { afterEach, describe, expect, it } from "vitest";
import { demoFromSearch, initDemo, isDemo, setDemoForTest } from "./demoFlag";

afterEach(() => setDemoForTest({ enabled: false, baseUrl: null, script: null, markers: false }));

describe("demo flag", () => {
  it("is off without ?demo=1", () => {
    expect(demoFromSearch("").enabled).toBe(false);
    expect(demoFromSearch("?demo=0").enabled).toBe(false);
  });

  it("reads ?demo=1 and the script", () => {
    expect(demoFromSearch("?demo=1")).toEqual({ enabled: true, baseUrl: null, script: "none", markers: false });
    expect(demoFromSearch("?demo=1&script=screens").script).toBe("screens");
  });

  it("initDemo uses the query in the browser and stores it", async () => {
    expect(isDemo()).toBe(false);
    const s = await initDemo("?demo=1&script=full");
    expect(s.script).toBe("full");
    expect(isDemo()).toBe(true);
  });
});
