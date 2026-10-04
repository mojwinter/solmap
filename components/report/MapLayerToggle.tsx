'use client';

import { SegmentedControl } from '@/components/map/MapControls';
import { useSolarMap, type MapLayer } from '@/components/map/SolarMap';
import { panelGradient } from '@/lib/geo/panels';

const LEGEND_LABEL = 'Panel colours: darker panels make more energy';

/**
 * The house window's map controls, top-left: A's icon-only Satellite / Sun exposure toggle and, while
 * panels are drawn, the panel-shade legend beside it (as MapControls shows them on the full map, minus
 * Recentre: the window never leaves the roof). Render as a child of SolarMap; it's marked as a top
 * inset, so the roof is fitted below it.
 */
export function MapLayerToggle() {
  const { layer, setLayer, sunAvailable, sunStatus, panelsShown } = useSolarMap();
  const sunLoading = layer === 'sun' && sunStatus === 'loading';
  return (
    <div data-map-inset="top" className="absolute top-3 left-3 flex items-center gap-3">
      <SegmentedControl<MapLayer>
        label="Map style"
        value={layer}
        onChange={setLayer}
        options={[
          { value: 'satellite', label: 'Satellite', icon: 'layers' },
          {
            value: 'sun',
            label: sunLoading ? 'Loading sun exposure…' : 'Sun exposure',
            icon: 'sun',
            busy: sunLoading,
            disabled: !sunAvailable,
            hint: sunStatus === 'none' ? 'No sun map for this roof' : 'Sun exposure isn’t available',
          },
        ]}
      />
      {panelsShown && (
        <span
          role="img"
          aria-label={LEGEND_LABEL}
          title="Darker panels make more energy"
          className="h-3 w-20 rounded-pill shadow-control motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
          style={{ backgroundImage: panelGradient('to right') }}
        />
      )}
    </div>
  );
}
