/**
 * Metres ↔ degrees on a flat local approximation: good to a few cm across a roof, and close
 * enough for ranking places a few hundred km apart. Pure, so finance and scripts can share it.
 */
import type { LatLngLiteral } from "@/src/types/app";

export const METERS_PER_DEG_LAT = 111_320;

/** Degrees of latitude and longitude per metre at `lat`. */
export function degreesPerMeter(lat: number): { lat: number; lng: number } {
  return {
    lat: 1 / METERS_PER_DEG_LAT,
    lng: 1 / (METERS_PER_DEG_LAT * Math.cos(lat * (Math.PI / 180))),
  };
}

/** Approximate distance in metres (equirectangular, at the mean latitude). */
export function metersBetween(a: LatLngLiteral, b: LatLngLiteral): number {
  const dy = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  const dx = (b.lng - a.lng) * METERS_PER_DEG_LAT * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot(dx, dy);
}
