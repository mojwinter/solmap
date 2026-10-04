/**
 * Design tokens for things Google Maps draws itself (polygons can't take CSS variables).
 * Reads the live value from app/globals.css so Day / Dusk stay in sync; falls back to the Day values.
 */
const FALLBACK = {
  "--sky-700": "#064e9e",
} as const;

export function token(name: keyof typeof FALLBACK): string {
  if (typeof document === "undefined") return FALLBACK[name];
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || FALLBACK[name];
}
