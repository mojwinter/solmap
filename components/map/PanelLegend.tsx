import { Icon } from "@/components/common/Icon";
import { panelGradient } from "@/lib/geo/panels";

const LABEL = "Panel colours: darker panels make more energy each year";

/**
 * Legend for the panel shades: a frosted pill reading panel icon · Less ▬▬ More, the bar being the
 * ramp panelColors() paints (light = less energy a year, dark = more). Sized like the map controls
 * (h-10), so it sits in their row. Show it only while panels are drawn (useSolarMap().panelsShown).
 */
export function PanelLegend({ className = "" }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label={LABEL}
      title="Darker panels make more energy each year"
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-pill glass-thin px-3 text-footnote text-ink-secondary motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 ${className}`}
    >
      <Icon name="panels" size={16} className="text-ink" />
      <span>Less</span>
      <span className="h-1.5 w-12 rounded-pill" style={{ backgroundImage: panelGradient("to right") }} />
      <span>More</span>
    </div>
  );
}
