'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { AddressSearch } from '@/components/map/AddressSearch';
import { MapControls } from '@/components/map/MapControls';
import { SolarMap, fitCamera, pointOnScreen } from '@/components/map/SolarMap';
import { Icon } from '@/components/common/Icon';
import type { PickedPlace } from '@/lib/geo/place';
import type { BuildingResponse, LatLngLiteral } from '@/src/types/app';
import { HOUSE_WINDOW_CLIP, HOUSE_WINDOW_MASK, HOUSE_WINDOW_RADIUS, HOUSE_WINDOW_SIZE, HouseCard } from './HouseCard';
import { MapLayerToggle } from './MapLayerToggle';

/** closed: the locked window in the report. opening/closing: growing to / shrinking from the screen. open: exploring. */
type Phase = 'closed' | 'opening' | 'open' | 'closing';

const DURATION_MS = 420;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/** HOUSE_WINDOW_RADIUS in px, for the open / close clip. */
const WINDOW_RADIUS = '23px';

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
  panel,
  onPick,
}: {
  location: LatLngLiteral;
  building: BuildingResponse | null;
  visibleCount: number;
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
  /** The window's camera when it was clicked (the opening effect moves it, and may run twice). */
  const startCamera = useRef<{ center: LatLngLiteral; zoom: number } | null>(null);
  const returning = useRef(false);
  const exploring = phase === 'open';
  /** The explore UI is in the page: invisible while opening, so the camera can be fitted round it. */
  const laidOut = phase === 'opening' || exploring;

  const open = () => {
    if (!slot.current) return;
    start.current = slot.current.getBoundingClientRect();
    const center = map?.getCenter()?.toJSON();
    const zoom = map?.getZoom();
    startCamera.current = center && zoom !== undefined ? { center, zoom } : null;
    setPhase('opening');
  };
  const close = () => setPhase('closing');

  // Opening is one motion: the map goes full size at once with the camera already where exploring
  // wants it (the roof clear of the search box, controls and results card), and a transform puts the
  // window's view back where it was; the transform eases out while the window's edges slide out to
  // the screen's (a clip, so the map is never squashed). If the two zooms differ, the map is drawn at
  // the further-out one and scaled up to stand in for the closer one (only ever up, so no edge shows),
  // taking the closer zoom for real once it lands. The explore UI is laid out (invisibly) from the first frame so
  // the camera can make room for it. Closing runs backwards, after framing the roof as the window
  // will. Before paint, so nothing flashes. Reduced motion: straight there.
  useLayoutEffect(() => {
    const el = frame.current;
    const inner = content.current;
    if (!el || !inner || (phase !== 'opening' && phase !== 'closing')) return;
    const opening = phase === 'opening';
    const rect = opening ? start.current : slot.current?.getBoundingClientRect();
    if (!rect) return;
    const { width: W, height: H } = el.getBoundingClientRect();
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
    const small = { clipPath: `inset(${rect.top}px ${W - rect.right}px ${H - rect.bottom}px ${rect.left}px round ${WINDOW_RADIUS})` };
    const full = { clipPath: 'inset(0px 0px 0px 0px round 0px)' };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing: KeyframeAnimationOptions = { duration: reduced ? 0 : DURATION_MS, easing: EASE, fill: 'forwards' };
    const reveal = el.animate(opening ? [small, full] : [full, small], timing);

    // The window's centre on screen, and the camera that shows it there before / after.
    const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    let slide: Animation;
    let land = () => {};
    const was = startCamera.current;
    if (opening && map && was) {
      const to = building ? fitCamera(map, building.boundingBox, 'report') : was;
      // Draw at the lower of the two zooms, centred where exploring will be: scale 2^(to - drawn) is
      // then exactly the explore view, and the window's view is that same drawing scaled by
      // 2^(was - drawn) about the screen's centre and moved so the window's centre lands on `from`.
      const drawn = { center: to.center, zoom: Math.min(was.zoom, to.zoom) };
      map.moveCamera(drawn);
      const at = pointOnScreen(was.center, drawn, { width: W, height: H });
      const s0 = 2 ** (was.zoom - drawn.zoom);
      const s1 = 2 ** (to.zoom - drawn.zoom);
      const tx = from.x - W / 2 - (at.x - W / 2) * s0;
      const ty = from.y - H / 2 - (at.y - H / 2) * s0;
      slide = inner.animate(
        [{ transform: `translate(${tx}px, ${ty}px) scale(${s0})` }, { transform: `translate(0px, 0px) scale(${s1})` }],
        timing,
      );
      land = () => {
        if (to.zoom !== drawn.zoom) map.moveCamera(to);
        slide.cancel();
      };
    } else {
      // Closing (or no map yet): the camera stays put and only slides between the screen's centre and the window's.
      const shifted = { transform: `translate(${from.x - W / 2}px, ${from.y - H / 2}px)` };
      const home = { transform: 'translate(0px, 0px)' };
      slide = inner.animate(opening ? [shifted, home] : [home, shifted], timing);
    }
    reveal.onfinish = () => {
      // Swap the scaled drawing for the real camera in the same frame.
      if (opening) land();
      else returning.current = true;
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
          data-house-window={phase === 'closed' ? '' : undefined}
          className={
            phase === 'closed'
              ? `relative size-full overflow-hidden ${HOUSE_WINDOW_RADIUS}`
              : 'fixed inset-0 z-50 overflow-hidden bg-sky-100'
          }
          // Closed, the rounded corners also come from a clip-path and a mask: overflow + border-radius
          // alone let Google's WebGL map canvas through square in Chrome, and the clip still did as the
          // panels redrew. Opening and closing animate the clip.
          style={phase === 'closed' ? { clipPath: HOUSE_WINDOW_CLIP, mask: HOUSE_WINDOW_MASK } : undefined}
        >
          <div ref={content} className="size-full">
          <SolarMap
            location={location}
            building={building}
            visibleCount={visibleCount}
            fitPadding={laidOut ? 'report' : 'window'}
            captions={false}
            locked={!exploring}
            holdCamera={phase === 'opening' || phase === 'closing'}
            onMapClick={laidOut ? onPick : undefined}
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
                  className={`absolute inset-x-0 top-0 bottom-5 cursor-zoom-in ${HOUSE_WINDOW_RADIUS} focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus-ring`}
                />
                <span
                  data-map-inset="bottom"
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 bottom-7 inline-flex items-center gap-1.5 rounded-pill glass-thin px-3 py-1.5 text-footnote text-ink"
                >
                  <Icon name="pin" size={14} />
                  Click to explore the map
                </span>
                {building && <MapLayerToggle />}
              </>
            )}
            {laidOut && (
              <div className={exploring ? undefined : 'invisible'}>
                <MapControls />
              </div>
            )}
          </SolarMap>
          </div>

          {laidOut && (
            <div className={exploring ? 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200' : 'invisible'}>
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
              {panel && exploring && (
                // A's card spot (right-6, 440px), bottom-aligned.
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
    </HouseCard>
  );
}
