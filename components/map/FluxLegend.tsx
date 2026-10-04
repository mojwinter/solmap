import { fluxGradient } from "@/lib/geo/flux";
import { ATTRIBUTION } from "@/src/config/bc";
import type { SolarLayersResponse } from "@/src/types/app";

/** Legend for the sun heatmap: shady → sunny bar, the fixed flux scale, and the data source. */
export function FluxLegend({ layers }: { layers: SolarLayersResponse }) {
  const { min, max, unit } = layers.fluxScale;
  return (
    <div className="w-64 rounded-lg glass-thin px-3 py-2">
      <div className="flex justify-between text-footnote text-ink-secondary">
        <span>Shady</span>
        <span>Sunny</span>
      </div>
      <div className="my-1 h-2 rounded-pill" style={{ backgroundImage: fluxGradient() }} aria-hidden="true" />
      <p className="text-footnote text-ink-secondary">
        {min.toLocaleString("en-CA")}–{max.toLocaleString("en-CA")} {unit}
      </p>
      <p className="text-footnote text-ink-tertiary">
        {layers.source === "fixture" ? "Sample sun map (synthetic, not Google data)." : `Sun map: ${ATTRIBUTION}`}
      </p>
    </div>
  );
}
