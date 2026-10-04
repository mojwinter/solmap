/**
 * The sun heatmap's legend, client-safe. The PNG itself is coloured server-side with IRON_PALETTE
 * in lib/solar/raster.ts (which pulls in pngjs, so it can't ship to the browser); flux.test.ts
 * asserts these stops are the same, so the legend can't drift from the image.
 */

/** Google's sample "iron" ramp: dark = shady, white-yellow = sunny. */
export const FLUX_LEGEND_STOPS = ["00000A", "91009C", "E64616", "FEB400", "FFFFF6"] as const;

/** CSS gradient for the legend bar, left = least sun. */
export function fluxGradient(stops: readonly string[] = FLUX_LEGEND_STOPS): string {
  return `linear-gradient(to right, ${stops.map((s) => `#${s}`).join(", ")})`;
}
