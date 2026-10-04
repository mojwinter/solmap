"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Circle, Map, Rectangle, useMap, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { ATTRIBUTION } from "@/src/config/bc";
import type { BuildingResponse, LatLngLiteral, SolarLayersResponse } from "@/src/types/app";
import { FluxLegend } from "./FluxLegend";
import { FluxOverlay } from "./FluxOverlay";
import { MAPS_API_KEY } from "./MapsProvider";
import { PanelOverlay } from "./PanelOverlay";
import { token } from "./tokens";

export type MapLayer = "satellite" | "sun";
/** The sun heatmap for the current roof (#29). "none" = no Data Layers for this roof (404). */
export type SunStatus = "idle" | "loading" | "ready" | "none" | "error";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID || undefined;
/** Close enough to read a single roof. */
const ROOF_ZOOM = 20;

/**
 * Space to keep clear when fitting the roof. "report" = the MapScreen layout (DESIGN.md §4): on
 * desktop the results card floats on the right (24 + 440 + 24 px) under the search box; on phones
 * the map is a strip above the bottom sheet.
 */
export type FitPadding = "report" | number | google.maps.Padding;

/** Gap between an overlay and the fitted roof. */
const OVERLAY_GAP = 12;
/** Padding may use at most this share of the map's width or height, so the roof always stays readable. */
const MAX_PADDING_SHARE = 0.5;

/**
 * The padding for fitBounds, sized to the map as it is right now. "report" measures the overlays
 * marked data-map-inset="top" (AddressSearch) and ="bottom" (MapControls) instead of guessing
 * their height, keeps the 440px card clear on desktop, then clamps everything so a short phone
 * strip still shows the roof zoomed in rather than the whole city.
 */
type Pad = { top: number; right: number; bottom: number; left: number };

function resolvePadding(padding: FitPadding, div: HTMLElement): Pad {
  const box = div.getBoundingClientRect();
  let p: Pad;
  if (padding === "report") {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    p = desktop ? { top: 24, right: 488, bottom: 24, left: 24 } : { top: 16, right: 16, bottom: 16, left: 16 };
    for (const el of document.querySelectorAll<HTMLElement>("[data-map-inset]")) {
      const r = el.getBoundingClientRect();
      const overlapsMap = r.width > 0 && r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right;
      if (!overlapsMap) continue;
      if (el.dataset.mapInset === "top") p.top = Math.max(p.top, r.bottom - box.top + OVERLAY_GAP);
      if (el.dataset.mapInset === "bottom") p.bottom = Math.max(p.bottom, box.bottom - r.top + OVERLAY_GAP);
    }
  } else {
    p =
      typeof padding === "number"
        ? { top: padding, right: padding, bottom: padding, left: padding }
        : { top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0 };
  }
  // Never let padding take more than half the map: shrink it proportionally instead.
  const clamp = (a: number, b: number, size: number): [number, number] => {
    const max = size * MAX_PADDING_SHARE;
    const total = a + b;
    return total > max && total > 0 ? [(a * max) / total, (b * max) / total] : [a, b];
  };
  [p.top, p.bottom] = clamp(p.top, p.bottom, box.height);
  [p.left, p.right] = clamp(p.left, p.right, box.width);
  return p;
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
  /**
   * The `heatmap` P1 flag (lib/flags.ts; read with getFlags() in the server page). Off by default:
   * "Sun exposure" then stays disabled and Data Layers is never called.
   */
  heatmap?: boolean;
  /** Floating controls drawn over the map, e.g. <MapControls />. They use useSolarMap(). */
  children?: ReactNode;
}

interface SolarMapState {
  /** Refit the camera to the roof (or the looked-up spot). */
  recentre: () => void;
  layer: MapLayer;
  setLayer: (layer: MapLayer) => void;
  /** Sun exposure can be chosen: flag on, a roof is shown, and it isn't known to have no sun map. */
  sunAvailable: boolean;
  sunStatus: SunStatus;
}

const SolarMapContext = createContext<SolarMapState>({
  recentre: () => {},
  layer: "satellite",
  setLayer: () => {},
  sunAvailable: false,
  sunStatus: "idle",
});

/** For controls inside <SolarMap>: the map layer, the sun map's status and recentre(). */
export const useSolarMap = () => useContext(SolarMapContext);

/**
 * Satellite map of one roof with its panels and a sun-500 roof outline (DESIGN.md §4). Must sit
 * inside <MapsProvider>. Shows `location` right away (with a dot until a roof arrives), then fits to the roof.
 *
 *   <SolarMap location={{ lat, lng }} building={building} visibleCount={building?.configs[i]?.panelsCount ?? 0}
 *             onMapClick={(p) => router.replace(`/report/${p.lat.toFixed(6)}/${p.lng.toFixed(6)}`)}
 *             fitPadding="report" captions={false} heatmap={flags.heatmap} className="h-full">
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
  heatmap = false,
  className,
  children,
}: Props) {
  const map = useMap();
  const bounds = building?.boundingBox;
  const roofId = building?.buildingId ?? null;

  // Sun mode belongs to one roof: a new roof drops back to Satellite instead of quietly buying
  // another Data Layers call ($75 / 1,000). Results are remembered per roof, so toggling is free.
  const [sunRoof, setSunRoof] = useState<string | null>(null);
  const [sunResult, setSunResult] = useState<{ roof: string; status: SunStatus; layers?: SolarLayersResponse } | null>(null);
  const sunCache = useRef(new globalThis.Map<string, { status: "ready" | "none"; layers?: SolarLayersResponse }>());
  const layer: MapLayer = heatmap && roofId !== null && sunRoof === roofId ? "sun" : "satellite";
  const sun = sunResult && sunResult.roof === roofId ? sunResult : null;
  const sunStatus: SunStatus = sun?.status ?? "idle";
  const sunAvailable = heatmap && building !== null && sunStatus !== "none";

  const setLayer = useCallback(
    (next: MapLayer) => {
      if (next === "satellite" || !building || !heatmap) {
        setSunRoof(null);
        return;
      }
      const roof = building.buildingId;
      setSunRoof(roof);
      const cached = sunCache.current.get(roof);
      if (cached) {
        setSunResult({ roof, ...cached });
        if (cached.status === "none") setSunRoof(null);
        return;
      }
      setSunResult({ roof, status: "loading" });
      const { lat, lng } = building.center;
      fetch(`/api/solar/layers?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}`)
        .then(async (res) => {
          if (res.ok) {
            const layers = (await res.json()) as SolarLayersResponse;
            sunCache.current.set(roof, { status: "ready", layers });
            setSunResult({ roof, status: "ready", layers });
          } else if (res.status === 404) {
            sunCache.current.set(roof, { status: "none" });
            setSunResult({ roof, status: "none" });
            setSunRoof((r) => (r === roof ? null : r));
          } else {
            setSunResult({ roof, status: "error" });
            setSunRoof((r) => (r === roof ? null : r));
          }
        })
        .catch(() => {
          setSunResult({ roof, status: "error" });
          setSunRoof((r) => (r === roof ? null : r));
        });
    },
    [building, heatmap],
  );

  const recentre = useCallback(() => {
    if (!map) return;
    if (bounds) {
      map.fitBounds(
        { south: bounds.sw.lat, west: bounds.sw.lng, north: bounds.ne.lat, east: bounds.ne.lng },
        resolvePadding(fitPadding, map.getDiv()),
      );
    } else {
      map.moveCamera({ center: location, zoom: ROOF_ZOOM });
    }
  }, [map, bounds, fitPadding, location]);
  const context = useMemo(
    () => ({ recentre, layer, setLayer, sunAvailable, sunStatus }),
    [recentre, layer, setLayer, sunAvailable, sunStatus],
  );
  const sunLayers = layer === "sun" && sun?.status === "ready" ? sun.layers : undefined;
  const sunNotice =
    sunStatus === "none" ? "No sun map for this roof." : sunStatus === "error" ? "Couldn't load the sun map. Try again." : null;

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
              {/* In Sun mode the heat replaces the panels; the roof outline stays on top of both. */}
              {sunLayers ? (
                <FluxOverlay layers={sunLayers} />
              ) : (
                <PanelOverlay building={building} visibleCount={visibleCount} />
              )}
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
          // Phones: just above the bottom-left controls. Desktop: centred at the bottom.
          <p data-map-inset="bottom" className="pointer-events-none absolute bottom-[88px] left-4 rounded-pill glass-thin px-3 py-1.5 text-footnote text-ink-secondary md:bottom-6 md:left-1/2 md:-translate-x-1/2">
            Not your roof? Click your roof on the map.
          </p>
        )}
        {(sunLayers || sunNotice) && (
          // Above the bottom-left controls (they sit at bottom-9, 40px tall).
          <div className="absolute bottom-[96px] left-4 md:left-6">
            {sunLayers ? (
              <FluxLegend layers={sunLayers} />
            ) : (
              <p role="status" className="rounded-pill glass-thin px-3 py-1.5 text-footnote text-ink-secondary">
                {sunNotice}
              </p>
            )}
          </div>
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
    const div = map.getDiv();
    let fitted = { w: 0, h: 0 };
    const fit = () => {
      fitted = { w: div.offsetWidth, h: div.offsetHeight };
      map.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, resolvePadding(padding, div));
    };
    const changed = (a: number, b: number) => Math.abs(a - b) > 0.15 * Math.max(b, 1);
    // A hidden (0×0) map can't be fitted (fitBounds would zoom out to city level), so the first fit
    // waits until it's laid out. After that, refit only when the size changes noticeably (pane
    // resize, phone rotation), so small jitter like a phone's address bar doesn't fight the user's panning.
    const observer = new ResizeObserver(() => {
      const w = div.offsetWidth;
      const h = div.offsetHeight;
      if (w === 0 || h === 0) return;
      if (fitted.w === 0 || changed(w, fitted.w) || changed(h, fitted.h)) fit();
    });
    if (div.offsetWidth > 0 && div.offsetHeight > 0) fit();
    observer.observe(div);
    return () => observer.disconnect();
    // padding objects are usually inline literals, so key on the mode/number only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sw.lat, sw.lng, ne.lat, ne.lng, typeof padding === "object" ? JSON.stringify(padding) : padding]);
  return null;
}
