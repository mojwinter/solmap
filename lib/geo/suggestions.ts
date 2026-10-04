/**
 * Places (New) autocomplete predictions → the rows the Daylight AddressSearch shows:
 * title = street address, subtitle = "City, Province · distance". Pure, so it runs in Node tests.
 */

/** The parts of google.maps.places.PlacePrediction we read (structural, so tests can pass plain objects). */
export interface PredictionLike {
  text: { text: string };
  mainText?: { text: string } | null;
  secondaryText?: { text: string } | null;
  distanceMeters?: number | null;
}

export interface SuggestionRow {
  title: string;
  subtitle: string;
}

/** 850 m · 1.2 km · 11 km */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function suggestionRow(p: PredictionLike): SuggestionRow {
  const title = p.mainText?.text || p.text.text;
  // Every result is in Canada (includedRegionCodes), so the country is noise.
  const place = p.secondaryText?.text.replace(/,\s*Canada$/, "") ?? "";
  const distance = p.distanceMeters != null && Number.isFinite(p.distanceMeters) ? formatDistance(p.distanceMeters) : "";
  return { title, subtitle: [place, distance].filter(Boolean).join(" · ") };
}
