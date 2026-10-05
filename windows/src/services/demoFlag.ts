/** Browser dev with fake data (`?summaries=demo`): the mock backend answers every fetch with nothing, so the network services stay off. */
export const isDemoSummaries = (): boolean =>
  import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("summaries") === "demo";
