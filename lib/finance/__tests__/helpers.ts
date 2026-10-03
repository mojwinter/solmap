import type { BuildingResponse, ConfigLite, SegmentLite } from "@/src/types/app";

/** Minimal BuildingResponse: only what the engine reads. Segments/quantiles default to empty. */
export function stubBuilding(
  configs: Pick<ConfigLite, "panelsCount" | "yearlyEnergyDcKwh">[] | ConfigLite[],
  apiPanelWatts = 400,
  overrides: Partial<BuildingResponse> = {},
): BuildingResponse {
  return {
    buildingId: "buildings/stub",
    center: { lat: 49.25, lng: -123.15 },
    boundingBox: { sw: { lat: 49.2499, lng: -123.1501 }, ne: { lat: 49.2501, lng: -123.1499 } },
    imagery: { quality: "HIGH", date: "2024-08-01" },
    panel: { capacityWatts: apiPanelWatts, heightMeters: 1.879, widthMeters: 1.045, lifetimeYears: 20 },
    roof: { areaMeters2: 0, maxPanels: 0, maxArrayAreaMeters2: 0, maxSunshineHoursPerYear: 0, sunshineQuantiles: [] },
    segments: [],
    panels: [],
    configs: configs.map((c) => ({ segments: [], ...c })),
    source: "fixture",
    ...overrides,
  };
}

export function segment(index: number, azimuthDegrees: number, sunshineQuantiles: number[], pitchDegrees = 30): SegmentLite {
  return { index, pitchDegrees, azimuthDegrees, areaMeters2: 80, sunshineQuantiles, center: { lat: 49.25, lng: -123.15 } };
}

/** Linear-ish configs from `from` to `to` panels at `kwhPerPanel` DC each, all on segment 0. */
export function linearConfigs(from: number, to: number, kwhPerPanel: number): ConfigLite[] {
  const out: ConfigLite[] = [];
  for (let n = from; n <= to; n++) {
    const e = n * kwhPerPanel;
    out.push({ panelsCount: n, yearlyEnergyDcKwh: e, segments: [{ segmentIndex: 0, panelsCount: n, yearlyEnergyDcKwh: e }] });
  }
  return out;
}
