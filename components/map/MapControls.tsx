"use client";

import { Icon, type IconName } from "@/components/common/Icon";
import { panelGradient } from "@/lib/geo/panels";
import { useSolarMap } from "./SolarMap";

export type { MapLayer } from "./SolarMap";

const LEGEND_LABEL = "Panel colours: darker panels make more energy";

/**
 * Bottom-left map controls: icon-only Satellite / Sun exposure toggle and Recentre (names live in
 * tooltips and aria-labels), plus the panel-shade legend while panels are drawn: just the colours,
 * the ramp panelColors() paints (light = less energy, dark = more).
 * - Desktop: a slim vertical strip hugging the left edge of the results card, in its lower part.
 *   The offset follows ReportLayout's card (right-6 + w-[440px]) plus a 12px gap; keep them in step.
 * - Phones: a short horizontal strip at the right edge of the map, level with the controls.
 * Both sit inside the space the roof fit already keeps clear (the card / the controls row).
 * Render inside <SolarMap>: everything comes from useSolarMap(), so there are no props to wire.
 */
export function MapControls() {
  const { recentre, layer, setLayer, sunAvailable, sunStatus, panelsShown } = useSolarMap();
  const sunLoading = layer === "sun" && sunStatus === "loading";
  return (
    <>
      {/* Inset 16/24px from the left (Daylight), but lifted clear of the Google logo in the
          bottom-left corner, which must stay visible (CLAUDE.md rule 3). */}
      <div data-map-inset="bottom" className="absolute bottom-9 left-4 flex items-center gap-2 md:left-6">
        <SegmentedControl
          label="Map style"
          // SolarMap already reports "sun" while its map loads, so a click shows at once.
          value={layer}
          onChange={setLayer}
          options={[
            { value: "satellite", label: "Satellite", icon: "layers" },
            {
              value: "sun",
              label: sunLoading ? "Loading sun exposure…" : "Sun exposure",
              icon: "sun",
              busy: sunLoading,
              disabled: !sunAvailable,
              hint: sunStatus === "none" ? "No sun map for this roof" : "Sun exposure isn't available",
            },
          ]}
        />
        <button type="button" onClick={recentre} aria-label="Recentre" title="Recentre" className={`${PILL} glass-thin size-10 justify-center`}>
          <Icon name="locate" size={18} />
        </button>
      </div>
      {panelsShown && (
        <>
          <span
            role="img"
            aria-label={LEGEND_LABEL}
            title="Darker panels make more energy"
            className="absolute right-[476px] bottom-14 hidden h-36 w-2.5 rounded-pill shadow-control ring-1 ring-white/70 md:block"
            style={{ backgroundImage: panelGradient("to top") }}
          />
          <span
            role="img"
            aria-label={LEGEND_LABEL}
            title="Darker panels make more energy"
            // Level with the 40px controls row (bottom-9): 36 + (40 − 10) / 2 = 51px.
            className="absolute right-4 bottom-[51px] h-2.5 w-14 rounded-pill shadow-control ring-1 ring-white/70 md:hidden"
            style={{ backgroundImage: panelGradient("to right") }}
          />
        </>
      )}
    </>
  );
}

const PILL =
  "inline-flex h-10 items-center rounded-pill text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[.97]";

interface Option<T extends string> {
  value: T;
  /** The segment's name: its aria-label and tooltip (the segment itself shows only the icon). */
  label: string;
  icon: IconName;
  /** Pulses the icon while the choice loads. */
  busy?: boolean;
  disabled?: boolean;
  /** Tooltip shown while disabled. */
  hint?: string;
}

/**
 * Icon-only segmented control on frost (the Daylight SegmentedControl's `onMap` look): a glass-thin
 * well with a sky-600 selected segment.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-10 items-center gap-0.5 rounded-pill glass-thin p-1">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            aria-busy={o.busy || undefined}
            disabled={o.disabled}
            title={o.disabled ? (o.hint ?? "Not available") : o.label}
            onClick={() => onChange(o.value)}
            className={`${PILL} size-8 justify-center disabled:cursor-not-allowed disabled:text-ink-tertiary ${
              selected ? "bg-sky-600 text-on-sky-600 shadow-control" : ""
            }`}
          >
            <Icon name={o.icon} size={18} className={o.busy ? "motion-safe:animate-pulse" : undefined} />
          </button>
        );
      })}
    </div>
  );
}
