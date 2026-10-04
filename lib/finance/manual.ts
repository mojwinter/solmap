import { degreesPerMeter, metersBetween } from '@/lib/geo/meters';
import { BC_SOLAR_YIELD, DEFAULT_INPUTS, MANUAL } from '@/src/config/bc';
import type { BuildingResponse, ConfigLite, LatLngLiteral } from '@/src/types/app';

/** What the no-coverage form asks: which way the sun-facing roof points. */
export type RoofFacing = keyof typeof MANUAL.azimuthDegrees;

export interface ManualRoof {
  center: LatLngLiteral;
  /** Sun-facing roof area the homeowner entered, m² */
  roofAreaM2: number;
  facing: RoofFacing;
}

export interface ManualEstimate {
  building: BuildingResponse;
  /** The entered area was out of range (or not a number) and was clamped: tell the user, like CLAMPED_INPUT. */
  clamped: boolean;
  /** Where the yield came from, for the assumptions list: nearest NRCan town and its AC kWh/kW for this facing. */
  yieldFrom: { town: string; acKwhPerKw: number };
}

/** Nearest BC_SOLAR_YIELD town to `p`. */
export function nearestYieldTown(p: LatLngLiteral) {
  let best: (typeof BC_SOLAR_YIELD.towns)[number] = BC_SOLAR_YIELD.towns[0];
  let bestM = Infinity;
  for (const t of BC_SOLAR_YIELD.towns) {
    const m = metersBetween(p, t);
    if (m < bestM) [best, bestM] = [t, m];
  }
  return best;
}

/**
 * No-coverage roof → a BuildingResponse the normal recommend() can run on
 * (FINANCIAL_MODEL.md → Manual estimate). No panels, one segment, configs minPanels…maxPanels.
 * Bad or too-small input gives empty configs, which recommend() reports as "Not enough usable roof".
 */
export function manualBuilding({ center, roofAreaM2, facing }: ManualRoof): ManualEstimate {
  // Like clampInputs: non-finite → the minimum.
  const area = Number.isFinite(roofAreaM2) ? Math.min(Math.max(roofAreaM2, 0), MANUAL.maxRoofAreaM2) : 0;
  const { panel } = MANUAL;
  const panelArea = panel.heightMeters * panel.widthMeters;
  const maxPanels = Math.floor((area * MANUAL.usableFraction) / panelArea);

  // NRCan yields are AC. evaluate() multiplies DC by dcToAcDerate, so divide by the default derate
  // here: at default inputs the AC result is exactly NRCan's.
  const town = nearestYieldTown(center);
  const acKwhPerKw = facing === 'FLAT' ? town.flat : town.south * MANUAL.orientationFactor[facing];
  const dcPerPanel = (acKwhPerKw / DEFAULT_INPUTS.dcToAcDerate) * (panel.capacityWatts / 1000);

  const configs: ConfigLite[] = [];
  for (let n = MANUAL.minPanels; n <= maxPanels; n++) {
    const e = n * dcPerPanel;
    configs.push({ panelsCount: n, yearlyEnergyDcKwh: e, segments: [{ segmentIndex: 0, panelsCount: n, yearlyEnergyDcKwh: e }] });
  }

  // A square of the entered area around the point: only used to frame the map.
  const halfSide = Math.max(Math.sqrt(area), 10) / 2;
  const perM = degreesPerMeter(center.lat);
  const dLat = halfSide * perM.lat;
  const dLng = halfSide * perM.lng;

  const building: BuildingResponse = {
    buildingId: 'manual',
    center,
    boundingBox: { sw: { lat: center.lat - dLat, lng: center.lng - dLng }, ne: { lat: center.lat + dLat, lng: center.lng + dLng } },
    // Required by the contract; there is no imagery. reasonChips skips the imagery chip for manual roofs.
    imagery: { quality: 'LOW', date: '' },
    panel: { ...panel },
    roof: {
      areaMeters2: area,
      maxPanels: configs.length > 0 ? maxPanels : 0,
      maxArrayAreaMeters2: configs.length > 0 ? maxPanels * panelArea : 0,
      maxSunshineHoursPerYear: 0,
      sunshineQuantiles: [],
    },
    segments:
      area > 0
        ? [
            {
              index: 0,
              pitchDegrees: facing === 'FLAT' ? 0 : MANUAL.pitchDegrees,
              azimuthDegrees: MANUAL.azimuthDegrees[facing],
              areaMeters2: area,
              sunshineQuantiles: [],
              center,
            },
          ]
        : [],
    panels: [],
    configs,
    source: 'manual',
  };
  return { building, clamped: area !== roofAreaM2, yieldFrom: { town: town.name, acKwhPerKw } };
}
