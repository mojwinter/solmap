"use client";

import { useSolarMap } from "./SolarMap";

export type MapLayer = "satellite" | "sun";

interface Props {
  layer?: MapLayer;
  onLayerChange?: (layer: MapLayer) => void;
  /** The sun heatmap (#29) isn't in yet, so "Sun exposure" is disabled until this is true. */
  sunAvailable?: boolean;
}

/**
 * Bottom-left map controls from the Daylight MapScreen: a "Satellite / Sun exposure" segmented
 * control on frost and a glass "Recentre" button. Render inside <SolarMap> (it uses useSolarMap).
 */
export function MapControls({ layer = "satellite", onLayerChange, sunAvailable = false }: Props) {
  const { recentre } = useSolarMap();
  return (
    // Inset 16/24px from the left (Daylight), but lifted clear of the Google logo in the bottom-left
    // corner, which must stay visible (CLAUDE.md rule 3).
    <div className="absolute bottom-9 left-4 flex gap-3 md:left-6">
      <SegmentedControl
        label="Map style"
        value={layer}
        onChange={(v) => onLayerChange?.(v)}
        options={[
          { value: "satellite", label: "Satellite" },
          { value: "sun", label: "Sun exposure", disabled: !sunAvailable },
        ]}
      />
      <button type="button" onClick={recentre} className={`${PILL} glass-thin gap-1.5 px-4`}>
        <LocateIcon />
        Recentre
      </button>
    </div>
  );
}

const PILL =
  "inline-flex h-10 items-center rounded-pill text-callout text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[.97]";

interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/**
 * Daylight SegmentedControl, `onMap` variant: a glass-thin well with a sky-600 selected segment.
 * Lives here until D promotes a shared one to components/common (the card needs "10 / 25 years").
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
            disabled={o.disabled}
            title={o.disabled ? "Coming soon" : undefined}
            onClick={() => onChange(o.value)}
            className={`${PILL} h-8 px-3 disabled:cursor-not-allowed disabled:text-ink-tertiary ${
              selected ? "bg-sky-600 text-on-sky-600 shadow-control" : ""
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LocateIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}
