"use client";

import { useEffect } from "react";
import { Circle, Map, useMap, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { ATTRIBUTION } from "@/src/config/bc";
import type { BuildingResponse, LatLngLiteral } from "@/src/types/app";
import { MAPS_API_KEY } from "./MapsProvider";
import { PanelOverlay } from "./PanelOverlay";

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID || undefined;
/** Close enough to read a single roof. */
const ROOF_ZOOM = 20;

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
  /** "Not your roof? Click it": called with the clicked point to re-query there. Adds the hint under the map. */
  onMapClick?: (point: LatLngLiteral) => void;
  /** Sizes the map itself (give it a height); the captions sit below it. */
  className?: string;
}

/**
 * Satellite map of one roof with its panels drawn on top. Must sit inside <MapsProvider>.
 * Shows `location` right away (with a dot until a roof arrives), then fits to the roof.
 *
 *   <SolarMap
 *     location={{ lat, lng }}
 *     building={building}
 *     visibleCount={building?.configs[i]?.panelsCount ?? 0}
 *     onMapClick={(p) => router.replace(`/report/${p.lat.toFixed(6)}/${p.lng.toFixed(6)}`)}
 *   />
 */
export function SolarMap({ location, building, visibleCount, onMapClick, className }: Props) {
  const handleClick = onMapClick
    ? (event: MapMouseEvent) => {
        const point = event.detail.latLng;
        if (point) onMapClick(point);
      }
    : undefined;

  return (
    <div>
      <Map
        className={className}
        mapId={MAP_ID}
        defaultCenter={location}
        defaultZoom={ROOF_ZOOM}
        mapTypeId="satellite"
        tilt={0}
        // The map sits in a scrolling page: plain scroll wheel scrolls the page, ctrl+scroll zooms.
        gestureHandling="cooperative"
        streetViewControl={false}
        mapTypeControl={false}
        clickableIcons={false}
        onClick={handleClick}
      >
        <FollowLocation location={location} />
        {building ? (
          <>
            <FitBuilding bounds={building.boundingBox} />
            <PanelOverlay building={building} visibleCount={visibleCount} />
          </>
        ) : (
          // Marks the looked-up spot until its roof arrives, or for good when there's no roof data.
          <Circle
            center={location}
            radius={1.2}
            fillColor="#ffffff"
            fillOpacity={1}
            strokeColor="#1a237e"
            strokeWeight={3}
            clickable={false}
          />
        )}
      </Map>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-500">
        {onMapClick && <span>Not your roof? Click your roof on the map.</span>}
        {building && <span>{SOURCE_NOTE[building.source]}</span>}
        {!MAPS_API_KEY && process.env.NODE_ENV !== "production" && (
          <span>No NEXT_PUBLIC_MAPS_API_KEY set: Google shows the map in development mode.</span>
        )}
      </p>
    </div>
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
function FitBuilding({ bounds }: { bounds: BuildingResponse["boundingBox"] }) {
  const map = useMap();
  const { sw, ne } = bounds;
  useEffect(() => {
    if (!map) return;
    const fit = () => map.fitBounds({ south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, 40);
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
  }, [map, sw.lat, sw.lng, ne.lat, ne.lng]);
  return null;
}
