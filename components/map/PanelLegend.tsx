"use client";

import { Popover } from "@base-ui/react/popover";
import { Icon } from "@/components/common/Icon";
import { panelGradient } from "@/lib/geo/panels";

/**
 * Legend for the panel shades, folded into a round ⓘ map control (size-10, like Recentre). It opens
 * a small "Panel strength" card: the ramp panelColors() paints (light = less energy a year, dark =
 * more) with Less / More under it. Opens on hover (desktop) and on tap or Enter (touch, keyboard),
 * like InfoPopover. Show it only while panels are drawn (useSolarMap().panelsShown).
 * `side`: where the card opens, away from the map edge the control sits on.
 */
export function PanelLegend({ side = "top" }: { side?: "top" | "bottom" }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={100}
        aria-label="Panel strength"
        className="inline-grid size-10 shrink-0 place-items-center rounded-pill glass-thin text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      >
        <Icon name="info" size={18} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side={side} align="start" sideOffset={8} collisionPadding={16} className="z-50">
          <Popover.Popup className="w-52 rounded-md bg-popover px-3 py-2.5 text-ink shadow-(--elev-control) outline-none">
            <p className="text-callout font-semibold">Panel strength</p>
            <div className="mt-2 h-2 rounded-pill" style={{ backgroundImage: panelGradient("to right") }} aria-hidden="true" />
            <div className="mt-1 flex justify-between text-footnote text-ink-secondary" aria-hidden="true">
              <span>Less</span>
              <span>More</span>
            </div>
            <p className="mt-1.5 text-footnote text-ink-secondary">Darker panels make more energy each year.</p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
