"use client";

import { useEffect, useState } from "react";
import { AddressSearch } from "@/components/map/AddressSearch";
import { MapControls, type MapLayer } from "@/components/map/MapControls";
import { MapsProvider } from "@/components/map/MapsProvider";
import { SolarMap } from "@/components/map/SolarMap";
import { ATTRIBUTION } from "@/src/config/bc";
import type { ApiError, BuildingResponse, LatLngLiteral } from "@/src/types/app";

// The committed synthetic roofs (fixtures/synthetic/*.json), served by /api/solar/building in fixtures mode.
const ROOFS = [
  { label: "South gable", lat: 49.25, lng: -123.1500206 },
  { label: "Shaded gable", lat: 49.2615, lng: -123.1702206 },
  { label: "East-west", lat: 48.4265, lng: -123.3165 },
  { label: "Flat roof", lat: 49.2488, lng: -122.98 },
  { label: "Multi-unit", lat: 49.1666, lng: -123.1336 },
  { label: "Base quality", lat: 50.6745, lng: -120.3273 },
  { label: "Tiny roof", lat: 49.888, lng: -119.496 },
];

/** The spot being looked up, from a roof button, an address pick or a map click. */
interface Lookup {
  point: LatLngLiteral;
  label: string;
  /** From an address pick: a province other than BC gets a warning. */
  province?: string | null;
}

type Result =
  | { kind: "loading" }
  | { kind: "roof"; building: BuildingResponse }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

/**
 * Dev preview of the Daylight MapScreen: full-screen map, AddressSearch top-left, map controls
 * bottom-left, and a stand-in for D's results card on the right (same layout as ReportLayout).
 * `start` (from ?lat=&lng=) opens it at any spot; otherwise at the first synthetic roof.
 */
export function DevMap({ start }: { start?: LatLngLiteral }) {
  const [lookup, setLookup] = useState<Lookup>(
    start
      ? { point: start, label: `${start.lat}, ${start.lng}` }
      : { point: { lat: ROOFS[0].lat, lng: ROOFS[0].lng }, label: ROOFS[0].label },
  );
  const [result, setResult] = useState<Result>({ kind: "loading" });
  const [configIndex, setConfigIndex] = useState(0);
  const [layer, setLayer] = useState<MapLayer>("satellite");

  // Every way of picking a spot comes through here, so loading starts together with the new lookup.
  const lookUp = (next: Lookup) => {
    setLookup(next);
    setResult({ kind: "loading" });
  };

  useEffect(() => {
    let cancelled = false;
    const { lat, lng } = lookup.point;
    fetch(`/api/solar/building?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}`)
      .then(async (res) => {
        const body = (await res.json()) as BuildingResponse | ApiError;
        if (cancelled) return;
        if (res.ok) {
          const building = body as BuildingResponse;
          setResult({ kind: "roof", building });
          setConfigIndex(Math.max(0, building.configs.length - 1));
        } else {
          setResult({ kind: "empty", message: explain(res.status, body as ApiError) });
        }
      })
      .catch((e) => {
        if (!cancelled) setResult({ kind: "error", message: `Lookup failed: ${String(e)}` });
      });
    return () => {
      cancelled = true;
    };
  }, [lookup]);

  const building = result.kind === "roof" ? result.building : null;
  const config = building?.configs[configIndex];
  const count = config?.panelsCount ?? 0;
  const kw = building ? (count * building.panel.capacityWatts) / 1000 : 0;
  // DESIGN.md → SizeSlider: "10 panels · 4.0 kW" (+ the config's DC energy).
  const sizeLabel = `${count} panel${count === 1 ? "" : "s"} · ${kw.toFixed(1)} kW · ${Math.round(
    config?.yearlyEnergyDcKwh ?? 0,
  ).toLocaleString("en-CA")} kWh/yr (DC)`;
  const outsideBC = lookup.province && lookup.province !== "BC";

  return (
    <MapsProvider>
      <div className="relative flex min-h-dvh flex-1 flex-col md:block">
        {/* The map is the canvas (ReportLayout): a strip on phones, full screen on desktop. */}
        <div className="relative h-[40dvh] md:fixed md:inset-0 md:h-auto">
          <SolarMap
            location={lookup.point}
            building={building}
            visibleCount={count}
            onMapClick={(point) => lookUp({ point, label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` })}
            fitPadding="report"
            captions={false}
            className="h-full"
          >
            <MapControls layer={layer} onLayerChange={setLayer} />
          </SolarMap>
          <div className="absolute top-4 right-4 left-4 md:top-6 md:right-auto md:left-6 md:w-[440px]">
            <AddressSearch
              onSelect={(place) =>
                lookUp({ point: { lat: place.lat, lng: place.lng }, label: place.address || "the picked address", province: place.province })
              }
            />
          </div>
        </div>

        {/* Stand-in for D's SolarCard, so the padding and insets can be checked before #49 wires the real one. */}
        <aside
          aria-label="Map playground"
          className="relative z-10 -mt-6 flex-1 rounded-t-xl glass p-5 md:absolute md:top-6 md:right-6 md:mt-0 md:max-h-[calc(100dvh-3rem)] md:w-[440px] md:flex-none md:overflow-y-auto md:rounded-xl"
        >
          <div className="grid gap-4">
            <header className="grid gap-1">
              <h1 className="text-title">Map playground</h1>
              <p className="text-callout text-ink-secondary">Dev only. D&apos;s report card goes here.</p>
            </header>

            <div role="status" className="grid gap-1 rounded-md bg-fill-quiet p-3 text-callout">
              <p className={result.kind === "error" ? "text-poor-ink" : result.kind === "empty" ? "text-fair-ink" : "text-ink"}>
                {statusText(lookup, result)}
              </p>
              {outsideBC && (
                <p className="text-fair-ink">
                  This address looks like it&apos;s outside BC ({lookup.province}). Solmap uses BC Hydro rates.
                </p>
              )}
            </div>

            {building &&
              (building.configs.length > 0 ? (
                <label className="grid gap-2 rounded-md bg-fill-quiet p-3">
                  <span className="text-headline">{sizeLabel}</span>
                  <input
                    type="range"
                    min={0}
                    max={building.configs.length - 1}
                    value={configIndex}
                    aria-valuetext={sizeLabel}
                    onChange={(e) => setConfigIndex(Number(e.target.value))}
                    className="accent-sky-600"
                  />
                </label>
              ) : (
                <p className="rounded-md bg-fill-quiet p-3 text-callout">This roof is too small for any panel layout.</p>
              ))}

            <div className="grid gap-2">
              <span className="text-callout text-ink-secondary">Synthetic roofs</span>
              <div className="flex flex-wrap gap-2">
                {ROOFS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => lookUp({ point: { lat: r.lat, lng: r.lng }, label: r.label })}
                    aria-pressed={lookup.label === r.label}
                    className={`h-8 rounded-pill px-3 text-callout focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                      lookup.label === r.label ? "bg-sky-600 text-on-sky-600" : "bg-fill-quiet text-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {building && (
              <p className="text-footnote text-ink-tertiary">
                {building.source === "live" || building.source === "cache"
                  ? ATTRIBUTION
                  : "Sample roof: synthetic test data, not Google imagery."}
              </p>
            )}
          </div>
        </aside>
      </div>
    </MapsProvider>
  );
}

function statusText(lookup: Lookup, result: Result): string {
  switch (result.kind) {
    case "loading":
      return `Looking up the roof at ${lookup.label}…`;
    case "roof": {
      const b = result.building;
      return `${lookup.label}: ${b.panels.length} panels on ${b.segments.length} roof segments · imagery ${b.imagery.quality} (${b.imagery.date}) · source ${b.source}`;
    }
    case "empty":
    case "error":
      return result.message;
  }
}

function explain(status: number, body: ApiError): string {
  switch (status) {
    case 404:
      return `${body.message ?? "No solar data for this spot."} (With SOLAR_SOURCE=fixtures only the 7 synthetic roofs have data.)`;
    case 400:
      return `That spot is outside BC: ${body.message ?? ""}`;
    case 429:
      return "Too many lookups. Wait a minute and try again.";
    default:
      return `${status} ${body.error ?? ""}: ${body.message ?? "something went wrong"}`;
  }
}
