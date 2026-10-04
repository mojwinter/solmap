'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { AddressSearch } from '@/components/map/AddressSearch';
import { MapControls } from '@/components/map/MapControls';
import { SolarMap } from '@/components/map/SolarMap';
import { Icon } from '@/components/common/Icon';
import type { PickedPlace } from '@/lib/geo/place';
import type { BuildingResponse, LatLngLiteral } from '@/src/types/app';
import { HOUSE_WINDOW_SIZE, HouseCard } from './HouseCard';
import { MapLayerToggle } from './MapLayerToggle';

/** closed: the locked window in the report. opening/closing: growing to / shrinking from the screen. open: exploring. */
type Phase = 'closed' | 'opening' | 'open' | 'closing';

const DURATION_MS = 420;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const WINDOW_RADIUS = '22px';

/**
 * The house window, and the full-screen map it opens into. In the report it's locked on the roof;
 * a click opens the same map (one Google map load, never two) to fill the screen, where it's the
 * explore map: drag and zoom, click a roof to look it up, search, Satellite / Sun + Recentre, and
 * `panel` (the answer) floating on the right on wide screens. "Back to report" or Escape shrinks
 * it back into the window.
 */
export function HouseWindow({
  location,
  building,
  visibleCount,
  heatmap,
  footer,
  panel,
  onPick,
}: {
  location: LatLngLiteral;
  building: BuildingResponse | null;
  visibleCount: number;
  heatmap: boolean;
  /** Under the window, in the card (the source line). */
  footer?: ReactNode;
  /** The floating results panel while exploring (desktop). */
  panel?: ReactNode;
  /** A clicked spot or a searched address while exploring. */
  onPick: (place: LatLngLiteral & { address?: string }) => void;
}) {
  const [phase, setPhase] = useState<Phase>('closed');
  const slot = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const map = useMap();
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const start = useRef<DOMRect | null>(null);
  const returning = useRef(false);
  const exploring = phase === 'open';

  const open = () => {
    if (!slot.current) return;
    start.current = slot.current.getBoundingClientRect();
    setPhase('opening');
  };
  const close = () => setPhase('closing');

  // Opening: the map goes full size at once, at the same zoom and shifted so the roof stays exactly
  // where it was, and the window's edges slide out to the screen's (a clip, so no tiles are stretched
  // or missing). Closing runs it backwards, after framing the roof as the window will. Before paint,
  // so nothing flashes. Reduced motion: straight there.
  useLayoutEffect(() => {
    const el = frame.current;
    const inner = content.current;
    if (!el || !inner || (phase !== 'opening' && phase !== 'closing')) return;
    const opening = phase === 'opening';
    const rect = opening ? start.current : slot.current?.getBoundingClientRect();
    if (!rect) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (!opening && map && building) {
      // The roof as the window will show it (its "window" fit), but on the full-size map.
      const desktop = window.matchMedia('(min-width: 768px)').matches;
      const pad = desktop ? 40 : 24;
      const x = (W - rect.width) / 2;
      const y = (H - rect.height) / 2;
      const { sw, ne } = building.boundingBox;
      map.fitBounds(
        { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng },
        { top: y + pad, right: x + pad, bottom: y + pad, left: x + pad },
      );
    }
    const dx = rect.left + rect.width / 2 - W / 2;
    const dy = rect.top + rect.height / 2 - H / 2;
    const small = { clipPath: `inset(${rect.top}px ${W - rect.right}px ${H - rect.bottom}px ${rect.left}px round ${WINDOW_RADIUS})` };
    const full = { clipPath: 'inset(0px 0px 0px 0px round 0px)' };
    const shifted = { transform: `translate(${dx}px, ${dy}px)` };
    const home = { transform: 'translate(0px, 0px)' };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing: KeyframeAnimationOptions = { duration: reduced ? 0 : DURATION_MS, easing: EASE, fill: 'forwards' };
    const reveal = el.animate(opening ? [small, full] : [full, small], timing);
    const slide = inner.animate(opening ? [shifted, home] : [home, shifted], timing);
    reveal.onfinish = () => {
      if (!opening) returning.current = true;
      setPhase(opening ? 'open' : 'closed');
    };
    return () => {
      reveal.cancel();
      slide.cancel();
    };
  }, [phase, map, building]);

  // While the map fills the screen: the page underneath doesn't scroll, Escape goes back, and focus
  // moves to "Back to report" (and back to the window afterwards).
  useEffect(() => {
    if (phase === 'closed') {
      if (returning.current) opener.current?.focus({ preventScroll: true });
      returning.current = false;
      return;
    }
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  }, [phase]);

  useEffect(() => {
    if (!exploring) return;
    closer.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exploring]);

  return (
    <HouseCard>
      {/* Keeps the window's place in the page while the map is out full screen. */}
      <div ref={slot} className={`${HOUSE_WINDOW_SIZE} print:hidden`}>
        <div
          ref={frame}
          role={exploring ? 'dialog' : undefined}
          aria-modal={exploring || undefined}
          aria-label={exploring ? 'Map' : undefined}
          className={
            phase === 'closed'
              ? 'relative size-full overflow-hidden rounded-lg'
              : 'fixed inset-0 z-50 overflow-hidden bg-sky-100'
          }
        >
          <div ref={content} className="size-full">
          <SolarMap
            location={location}
            building={building}
            visibleCount={visibleCount}
            fitPadding={exploring ? 'report' : 'window'}
            captions={false}
            heatmap={heatmap}
            locked={!exploring}
            holdCamera={phase === 'opening' || phase === 'closing'}
            onMapClick={exploring ? onPick : undefined}
            className="size-full"
          >
            {phase === 'closed' && (
              <>
                {/* The whole window opens the map (short of Google's terms line at the bottom). */}
                <button
                  ref={opener}
                  type="button"
                  aria-label="Explore the map"
                  onClick={open}
                  className="absolute inset-x-0 top-0 bottom-5 cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus-ring"
                />
                <span
                  data-map-inset="bottom"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 bottom-7 inline-flex items-center gap-1.5 rounded-pill glass-thin px-3 py-1.5 text-footnote text-ink"
                >
                  <Icon name="pin" size={14} />
                  Click to explore the map
                </span>
                {building && heatmap && <MapLayerToggle />}
              </>
            )}
            {exploring && <MapControls />}
          </SolarMap>
          </div>

          {exploring && (
            <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <div className="absolute top-4 right-[76px] left-4 md:top-6 md:right-auto md:left-6 md:w-[360px]">
                <AddressSearch onSelect={(p: PickedPlace) => onPick({ lat: p.lat, lng: p.lng, address: p.address || undefined })} />
              </div>
              <button
                ref={closer}
                type="button"
                onClick={close}
                aria-label="Back to report"
                className="absolute top-4 right-4 inline-flex h-[46px] min-w-[46px] items-center justify-center gap-1.5 rounded-pill glass px-3 text-callout font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-safe:active:scale-[.97] md:top-6 md:right-6 md:px-4"
              >
                <Icon name="x" size={18} strokeWidth={2} />
                <span className="hidden md:inline">Back to report</span>
              </button>
              {panel && (
                // A's card spot (right-6, 440px), bottom-aligned: MapControls' panel-shade legend sits beside its bottom.
                <aside
                  aria-label="Solar summary"
                  className="absolute right-6 bottom-6 hidden max-h-[calc(100%-110px)] w-[440px] overflow-y-auto rounded-xl glass p-5 md:block motion-safe:animate-in motion-safe:slide-in-from-right-4"
                >
                  {panel}
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
      {footer}
    </HouseCard>
  );
}
