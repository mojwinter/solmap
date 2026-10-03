/**
 * Validated Google buildingInsights → our BuildingResponse (src/types/app.ts).
 * The one place {latitude, longitude} becomes {lat, lng}. Pure: no fetch, no env.
 */
import type { BuildingResponse, LatLngLiteral } from "@/src/types/app";
import type { SolarBuilding } from "./schema";

type GLatLng = { latitude: number; longitude: number };

const toLatLng = (p: GLatLng): LatLngLiteral => ({ lat: p.latitude, lng: p.longitude });

const pad = (n: number) => String(n).padStart(2, "0");

export function trimBuilding(raw: SolarBuilding, source: BuildingResponse["source"]): BuildingResponse {
  const sp = raw.solarPotential;
  const d = raw.imageryDate;
  return {
    buildingId: raw.name,
    center: toLatLng(raw.center),
    boundingBox: { sw: toLatLng(raw.boundingBox.sw), ne: toLatLng(raw.boundingBox.ne) },
    imagery: { quality: raw.imageryQuality, date: `${d.year}-${pad(d.month)}-${pad(d.day)}` },
    ...(raw.postalCode !== undefined && { postalCode: raw.postalCode }),
    ...(raw.administrativeArea !== undefined && { administrativeArea: raw.administrativeArea }),
    panel: {
      capacityWatts: sp.panelCapacityWatts,
      heightMeters: sp.panelHeightMeters,
      widthMeters: sp.panelWidthMeters,
      lifetimeYears: sp.panelLifetimeYears,
    },
    roof: {
      areaMeters2: sp.wholeRoofStats.areaMeters2,
      maxPanels: sp.maxArrayPanelsCount,
      maxArrayAreaMeters2: sp.maxArrayAreaMeters2,
      maxSunshineHoursPerYear: sp.maxSunshineHoursPerYear,
      sunshineQuantiles: sp.wholeRoofStats.sunshineQuantiles,
    },
    segments: sp.roofSegmentStats.map((s, index) => ({
      index,
      pitchDegrees: s.pitchDegrees,
      azimuthDegrees: s.azimuthDegrees,
      areaMeters2: s.stats.areaMeters2,
      sunshineQuantiles: s.stats.sunshineQuantiles,
      center: toLatLng(s.center),
    })),
    panels: sp.solarPanels.map((p) => ({
      ...toLatLng(p.center),
      landscape: p.orientation === "LANDSCAPE",
      segmentIndex: p.segmentIndex,
      yearlyEnergyDcKwh: p.yearlyEnergyDcKwh,
    })),
    configs: sp.solarPanelConfigs.map((c) => ({
      panelsCount: c.panelsCount,
      yearlyEnergyDcKwh: c.yearlyEnergyDcKwh,
      segments: c.roofSegmentSummaries.map((s) => ({
        segmentIndex: s.segmentIndex,
        panelsCount: s.panelsCount,
        yearlyEnergyDcKwh: s.yearlyEnergyDcKwh,
      })),
    })),
    source,
  };
}
