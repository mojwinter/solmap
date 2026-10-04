"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Circle, Map, Rectangle, useMap, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { ATTRIBUTION } from "@/src/config/bc";
import type { BuildingResponse, LatLngLiteral } from "@/src/types/app";
import { MAPS_API_KEY } from "./MapsProvider";
import { PanelOverlay } from "./PanelOverlay";
import { token } from "./tokens";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID || undefined;
/** Close enough to read a single roof. */
const ROOF_ZOOM = 20;

/**
 * Space to keep clear when fitting the roof. "report" = the MapScreen layout (DESIGN.md §4): on
 * desktop the results card floats on the right (24 + 440 + 24 px) under the search box; on phones
 * the map is a strip above the bottom sheet.
 */
export type FitPadding = "report" | number | google.maps.Padding;

function resolvePadding(padding: FitPadding): number | google.maps.Padding {
  if (padding !== "report") return padding;
  const desktop = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  // Desktop: clear of the search box (top), the 440px card (right) and the controls (bottom).
  // Phones: the map is a strip with the search box on top and the controls at the bottom.
  return desktop ? { top: 112, right: 488, bottom: 88, left: 24 } : { top: 96, right: 16, bottom: 84, left: 16 };
}

interface Props {
  /** The point being looked up: the picked address or the clicked spot. Shown straight away. */
  location: LatLngLiteral;
  /**
   * The roof found at `location`, or null while loading / after a 404. Keep it in state (the same
   * object between renders): a new object rebuilds every panel polygon.
   */
  building: BuildingResponse | null;
  /**
   * How many of the best panels to draw. For the size slider's config `i` that's
   * `building.configs[i].panelsCount` (configs are cumulative: config i = the best N panels).
   */
  visibleCount: number;
  /** "Not your roof? Click it": called with the clicked point to re-query there. Adds a hint. */
  onMapClick?: (point: LatLngLiteral) => void;
  /** Space kept clear when fitting the roof (default 40px). Use "report" for the full-screen MapScreen. */
  fitPadding?: FitPadding;
  /**
   * Show the attribution / hint line under the map (default). Pass false on the full-screen report,
   * where the results card shows <Attribution>; the hint then floats on the map instead.
   */
  captions?: boolean;
  /** Sizes the map (give it a height, or h-full for a full-screen canvas). */
  className?: string;
  /** Floating controls drawn over the map, e.g. <MapControls />. They can call useSolarMap().recentre(). */
  children?: ReactNode;
}

const SolarMapContext = createContext<{ recentre: () => void }>({ recentre: () => {} });

/** For controls inside <SolarMap>: recentre() refits the camera to the roof (or the looked-up spot). */
export const useSolarMap = () => useContext(SolarMapContext);

/**
 * Satellite map of one roof with its panels and a sun-500 roof outline (DESIGN.md §4). Must sit
 * inside <MapsProvider>. Shows `location` right away (with a dot until a roof arrives), then fits to the roof.
 *
 *   <SolarMap location={{ lat, lng }} building={building} visibleCount={building?.configs[i]?.panelsCount ?? 0}
 *             onMapClick={(p) => router.replace(`/report/${p.lat.toFixed(6)}/${p.lng.toFixed(6)}`)}
 *             fitPadding="report" captions={false} className="h-full">
 *     <MapControls />
 *   </SolarMap>
 */
export function SolarMap({
  location,
  building,
  visibleCount,
  onMapClick,
  fitPadding = 40,
  captions = true,
  className,
  children,
}: Props) {
  const map = useMap();
  const bounds = building?.boundingBox;

  const recentre = useCallback(() => {
    if (!map) return;
    if (bounds) {
      map.fitBounds(
        { south: bounds.sw.lat, west: bounds.sw.lng, north: bounds.ne.lat, east: bounds.ne.lng },
        resolvePadding(fitPadding),
      );
    } else {
      map.moveCamera({ center: location, zoom: ROOF_ZOOM });
    }
  }, [map, bounds, fitPadding, location]);
  const context = useMemo(() => ({ recentre }), [recentre]);

  const handleClick = onMapClick
    ? (event: MapMouseEvent) => {
        const point = event.detail.latLng;
        if (point) onMapClick(point);
      }
    : undefined;

  return (
    <SolarMapContext.Provider value={context}>
      <div className={`relative ${className ?? ""}`}>
        <Map
          className="h-full w-full"
          mapId={MAP_ID}
          defaultCenter={location}
          defaultZoom={ROOF_ZOOM}
          mapTypeId="satellite"
          tilt={0}
          // The map sits in a scrolling page: plain scroll wheel scrolls the page, ctrl+scroll zooms.
          gestureHandling="cooperative"
          // Our own controls (MapControls) replace Google's; the Google logo and terms stay visible.
          disableDefaultUI
          clickableIcons={false}
          onClick={handleClick}
        >
          <FollowLocation location={location} />
          {building ? (
            <>
              <FitBuilding bounds={building.boundingBox} padding={fitPadding} />
              <PanelOverlay building={building} visibleCount={visibleCount} />
              <RoofOutline bounds={building.boundingBox} />
            </>
          ) : (
            // Marks the looked-up spot until its roof arrives, or for good when there's no roof data.
            <Circle
              center={location}
              radius={1.2}
              fillColor="#ffffff"
              fillOpacity={1}
              strokeColor={token("--sky-700")}
              strokeWeight={3}
              clickable={false}
            />
          )}
        </Map>
        {onMapClick && !captions && (
          <p className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 rounded-pill glass-thin px-3 py-1.5 text-footnote text-ink-secondary md:block">
            Not your roof? Click your roof on the map.
          </p>
        )}
        {children}
      </div>
      {captions && (
        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-secondary">
          {onMapClick && <span>Not your roof? Click your roof on the map.</span>}
          {building && <span>{SOURCE_NOTE[building.source]}</span>}
          {!MAPS_API_KEY && process.env.NODE_ENV !== "production" && (
            <span>No NEXT_PUBLIC_MAPS_API_KEY set: Google shows the map in development mode.</span>
          )}
        </p>
      )}
    </SolarMapContext.Provider>
  );
}

// CLAUDE.md rule 3: Google's attribution (from bc.ts, rule 4) wherever their Solar data is shown,
// i.e. live and cache only.
const SOURCE_NOTE: Record<BuildingResponse["source"], string> = {
  live: ATTRIBUTION,
  cache: ATTRIBUTION,
  fixture: "Synthetic roof for development (not Google data).",
  manual: "Estimate from your inputs (no solar data for this roof).",
};

/** The selected roof: 3px sun-500 outline with a soft sun halo (Daylight MapScreen). */
function RoofOutline({ bounds }: { bounds: BuildingResponse["boundingBox"] }) {
  const box = useMemo(
    () => ({ south: bounds.sw.lat, west: bounds.sw.lng, north: bounds.ne.lat, east: bounds.ne.lng }),
    [bounds.sw.lat, bounds.sw.lng, bounds.ne.lat, bounds.ne.lng],
  );
  const sun = token("--sun-500");
  return (
    <>
      <Rectangle bounds={box} strokeColor={sun} strokeOpacity={0.25} strokeWeight={12} fillOpacity={0} clickable={false} />
      <Rectangle bounds={box} strokeColor={sun} strokeOpacity={1} strokeWeight={3} fillOpacity={0} clickable={false} />
    </>
  );
}

/**
 * Move the camera to a new location only if it's off screen or we're zoomed out: a searched address
 * elsewhere gets flown to, a clicked spot (already in view, close up) leaves the camera alone.
 */
function FollowLocation({ location }: { location: LatLngLiteral }) {
  const map = useMap();
  const { lat, lng } = location;
  useEffect(() => {
    if (!map) return;
    const inView = map.getBounds()?.contains({ lat, lng }) ?? false;
    if (inView && (map.getZoom() ?? 0) >= 17) return;
    map.moveCamera({ center: { lat, lng }, zoom: ROOF_ZOOM });
  }, [map, lat, lng]);
  return null;
}

/** Re-fit the camera when the bounds change (a new address keeps the same map instance). */
function FitBuilding({ bounds, padding }: { bounds: BuildingResponse["boundingBox"]; padding: FitPadding }) {
  const map = useMap();
  const { sw, ne } = bounds;
  useEffect(() => {
    if (!map) return;
    const fit = () =>
      map.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, resolvePadding(padding));
    const div = map.getDiv();
    const hasSize = () => div.offsetWidth > 0 && div.offsetHeight > 0;
    if (hasSize()) {
      fit();
      return;
    }
    // fitBounds on a hidden (0×0) map zooms out to city level, so wait until it's laid out
    // (a collapsed section or tab that opens later).
    const observer = new ResizeObserver(() => {
      if (!hasSize()) return;
      observer.disconnect();
      fit();
    });
    observer.observe(div);
    return () => observer.disconnect();
    // padding objects are usually inline literals, so key on the mode/number only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sw.lat, sw.lng, ne.lat, ne.lng, typeof padding === "object" ? JSON.stringify(padding) : padding]);
  return null;
}
