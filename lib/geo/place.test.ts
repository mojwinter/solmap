import { describe, expect, it } from "vitest";
import { pickedPlace, type PlaceLike } from "./place";

const at = (lat: number, lng: number) => ({ lat: () => lat, lng: () => lng });

const kitsilano: PlaceLike = {
  location: at(49.2684, -123.1683),
  formattedAddress: "2305 W 7th Ave, Vancouver, BC V6K 1Y4, Canada",
  addressComponents: [
    { types: ["street_number"], shortText: "2305" },
    { types: ["locality", "political"], shortText: "Vancouver" },
    { types: ["administrative_area_level_1", "political"], shortText: "BC" },
    { types: ["country", "political"], shortText: "CA" },
  ],
};

describe("pickedPlace", () => {
  it("returns the location, address and province of a picked place", () => {
    expect(pickedPlace(kitsilano)).toEqual({
      lat: 49.2684,
      lng: -123.1683,
      address: "2305 W 7th Ave, Vancouver, BC V6K 1Y4, Canada",
      province: "BC",
    });
  });

  it("reports a province outside BC so the page can warn", () => {
    const calgary: PlaceLike = {
      location: at(51.0447, -114.0719),
      formattedAddress: "Calgary, AB, Canada",
      addressComponents: [{ types: ["administrative_area_level_1", "political"], shortText: "AB" }],
    };
    expect(pickedPlace(calgary)?.province).toBe("AB");
  });

  it("returns null without a usable location", () => {
    expect(pickedPlace({ ...kitsilano, location: null })).toBeNull();
    expect(pickedPlace({ ...kitsilano, location: undefined })).toBeNull();
    expect(pickedPlace({ ...kitsilano, location: at(Number.NaN, -123.1) })).toBeNull();
  });

  it("tolerates a missing address and address components", () => {
    expect(pickedPlace({ location: at(49.25, -123.15) })).toEqual({
      lat: 49.25,
      lng: -123.15,
      address: "",
      province: null,
    });
  });
});
