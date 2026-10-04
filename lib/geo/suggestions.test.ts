import { describe, expect, it } from "vitest";
import { formatDistance, suggestionRow } from "./suggestions";

describe("formatDistance", () => {
  it.each([
    [4, "10 m"],
    [847, "850 m"],
    [1200, "1.2 km"],
    [8449, "8.4 km"],
    [11200, "11 km"],
  ])("%d m → %s", (meters, text) => {
    expect(formatDistance(meters)).toBe(text);
  });
});

describe("suggestionRow", () => {
  it("uses the street as the title and 'City, Province · distance' as the subtitle", () => {
    expect(
      suggestionRow({
        text: { text: "4127 Oak Street, Vancouver, BC, Canada" },
        mainText: { text: "4127 Oak Street" },
        secondaryText: { text: "Vancouver, BC, Canada" },
        distanceMeters: 1200,
      }),
    ).toEqual({ title: "4127 Oak Street", subtitle: "Vancouver, BC · 1.2 km" });
  });

  it("falls back to the full text and drops a missing distance", () => {
    expect(suggestionRow({ text: { text: "Oakridge Park" }, secondaryText: { text: "Vancouver, BC" } })).toEqual({
      title: "Oakridge Park",
      subtitle: "Vancouver, BC",
    });
    expect(suggestionRow({ text: { text: "Somewhere" }, distanceMeters: null })).toEqual({
      title: "Somewhere",
      subtitle: "",
    });
  });
});
