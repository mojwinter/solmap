/**
 * Google Solar API response types (the subset we use, plus what's cheap to keep).
 * Based on https://developers.google.com/maps/documentation/solar/reference/rest
 * and the official sample app (googlemaps-samples/js-solar-potential).
 *
 * These are the RAW Google shapes. They never leave the server; see src/types/app.ts
 * for what the frontend receives.
 */

/**
 * HIGH ≈ 0.1 m/px aerial, MEDIUM ≈ 0.25 m aerial, BASE = 0.25 m enhanced satellite
 * (GA only in some countries; in Canada it needs `experiments=EXPANDED_COVERAGE`, a pre-GA
 * feature), LOW ≈ 0.5 m+ satellite. See docs/SOLAR_API.md → Quality and coverage.
 */
export type ImageryQuality = 'HIGH' | 'MEDIUM' | 'BASE' | 'LOW';

/** Query params for buildingInsights:findClosest (and dataLayers:get, plus radiusMeters/view). */
export interface FindClosestParams {
  'location.latitude': number;
  'location.longitude': number;
  /** Minimum acceptable quality. The API always returns the best quality it has at or above this. */
  requiredQuality?: ImageryQuality;
  exactQualityRequired?: boolean;
  /** Pre-GA. 'EXPANDED_COVERAGE' together with requiredQuality=BASE. */
  experiments?: 'EXPANDED_COVERAGE'[];
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface LatLngBox {
  sw: LatLng;
  ne: LatLng;
}

export interface GDate {
  year: number;
  month: number;
  day: number;
}

export interface SizeAndSunshineStats {
  areaMeters2: number;
  /** 11 quantiles (min → max) of annual sunshine hours across the area. */
  sunshineQuantiles: number[];
  groundAreaMeters2: number;
}

export interface RoofSegmentSizeAndSunshineStats {
  pitchDegrees: number;
  /** 0 = north, 90 = east, 180 = south, 270 = west. */
  azimuthDegrees: number;
  stats: SizeAndSunshineStats;
  center: LatLng;
  boundingBox: LatLngBox;
  planeHeightAtCenterMeters: number;
}

export interface SolarPanel {
  center: LatLng;
  orientation: 'LANDSCAPE' | 'PORTRAIT';
  segmentIndex: number;
  yearlyEnergyDcKwh: number;
}

export interface RoofSegmentSummary {
  pitchDegrees: number;
  azimuthDegrees: number;
  panelsCount: number;
  yearlyEnergyDcKwh: number;
  segmentIndex: number;
}

export interface SolarPanelConfig {
  panelsCount: number;
  yearlyEnergyDcKwh: number;
  roofSegmentSummaries: RoofSegmentSummary[];
}

export interface SolarPotential {
  maxArrayPanelsCount: number;
  maxArrayAreaMeters2: number;
  maxSunshineHoursPerYear: number;
  carbonOffsetFactorKgPerMwh: number;
  panelCapacityWatts: number;
  panelHeightMeters: number;
  panelWidthMeters: number;
  panelLifetimeYears: number;
  wholeRoofStats: SizeAndSunshineStats;
  buildingStats: SizeAndSunshineStats;
  /** Treat as possibly missing (zod: default []). */
  roofSegmentStats?: RoofSegmentSizeAndSunshineStats[];
  /** Sorted best-first. Config i uses solarPanels.slice(0, config.panelsCount). Possibly missing on tiny roofs. */
  solarPanels?: SolarPanel[];
  /** Ascending by panelsCount. May be missing/empty for tiny roofs. */
  solarPanelConfigs?: SolarPanelConfig[];
  /** US only. Ignore for BC. */
  financialAnalyses?: unknown;
}

export interface BuildingInsightsResponse {
  name: string;
  center: LatLng;
  boundingBox: LatLngBox;
  imageryDate: GDate;
  imageryProcessedDate: GDate;
  imageryQuality: ImageryQuality;
  postalCode?: string;
  administrativeArea?: string;
  statisticalArea?: string;
  regionCode?: string;
  solarPotential: SolarPotential;
}

export interface DataLayersResponse {
  imageryDate: GDate;
  imageryProcessedDate: GDate;
  dsmUrl: string;
  rgbUrl: string;
  maskUrl: string;
  annualFluxUrl: string;
  monthlyFluxUrl: string;
  hourlyShadeUrls: string[];
  imageryQuality: ImageryQuality;
}

export interface GoogleApiError {
  error: { code: number; message: string; status: string };
}
