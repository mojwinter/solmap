/**
 * Zod schemas for the parts of Google's buildingInsights response we depend on
 * (types: src/types/solar.ts). Unknown fields are stripped. The per-panel arrays can be
 * missing on tiny roofs, so they default to [] (docs/SOLAR_API.md → Gotchas 4 and 5).
 */
import { z } from "zod";

export const imageryQualitySchema = z.enum(["HIGH", "MEDIUM", "BASE", "LOW"]);

const latLngSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const latLngBoxSchema = z.object({ sw: latLngSchema, ne: latLngSchema });

const dateSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  day: z.number().int(),
});

const sizeAndSunshineSchema = z.object({
  areaMeters2: z.number(),
  sunshineQuantiles: z.array(z.number()),
});

const roofSegmentSchema = z.object({
  pitchDegrees: z.number().default(0), // Google omits zero-valued fields (flat roofs, due north)
  azimuthDegrees: z.number().default(0),
  stats: sizeAndSunshineSchema,
  center: latLngSchema,
  boundingBox: latLngBoxSchema,
  planeHeightAtCenterMeters: z.number().optional(),
});

const solarPanelSchema = z.object({
  center: latLngSchema,
  orientation: z.enum(["LANDSCAPE", "PORTRAIT"]),
  segmentIndex: z.number().int().default(0),
  yearlyEnergyDcKwh: z.number(),
});

const roofSegmentSummarySchema = z.object({
  pitchDegrees: z.number().default(0),
  azimuthDegrees: z.number().default(0),
  panelsCount: z.number().int(),
  yearlyEnergyDcKwh: z.number(),
  segmentIndex: z.number().int().default(0),
});

const solarPanelConfigSchema = z.object({
  panelsCount: z.number().int(),
  yearlyEnergyDcKwh: z.number(),
  roofSegmentSummaries: z.array(roofSegmentSummarySchema).default([]),
});

const solarPotentialSchema = z.object({
  maxArrayPanelsCount: z.number().int().default(0),
  maxArrayAreaMeters2: z.number().default(0),
  maxSunshineHoursPerYear: z.number(),
  panelCapacityWatts: z.number(),
  panelHeightMeters: z.number(),
  panelWidthMeters: z.number(),
  panelLifetimeYears: z.number(),
  wholeRoofStats: sizeAndSunshineSchema,
  roofSegmentStats: z.array(roofSegmentSchema).default([]),
  solarPanels: z.array(solarPanelSchema).default([]),
  solarPanelConfigs: z.array(solarPanelConfigSchema).default([]),
});

export const buildingInsightsSchema = z.object({
  name: z.string(),
  center: latLngSchema,
  boundingBox: latLngBoxSchema,
  imageryDate: dateSchema,
  imageryQuality: imageryQualitySchema,
  postalCode: z.string().optional(),
  administrativeArea: z.string().optional(),
  regionCode: z.string().optional(),
  solarPotential: solarPotentialSchema,
});

/** The validated subset of BuildingInsightsResponse. Arrays are always present. */
export type SolarBuilding = z.infer<typeof buildingInsightsSchema>;

export const googleApiErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string().default(""),
    status: z.string().default(""),
  }),
});

/**
 * dataLayers:get (view=IMAGERY_AND_ANNUAL_FLUX_LAYERS). We only use the annual flux and mask
 * rasters; their URLs are only valid for an hour, so the cache keeps the bytes, not the URLs.
 */
export const dataLayersSchema = z.object({
  imageryDate: dateSchema,
  imageryQuality: imageryQualitySchema,
  annualFluxUrl: z.string(),
  maskUrl: z.string(),
});
export type SolarDataLayers = z.infer<typeof dataLayersSchema>;
