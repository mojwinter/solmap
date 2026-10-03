"use client";

import { useEffect, useState } from "react";
import { AddressSearch } from "@/components/map/AddressSearch";
import { MapsProvider } from "@/components/map/MapsProvider";
import { SolarMap } from "@/components/map/SolarMap";
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

/** `start` (from ?lat=&lng=) opens the playground at any spot; otherwise at the first synthetic roof. */
export function DevMap({ start }: { start?: LatLngLiteral }) {
  const [lookup, setLookup] = useState<Lookup>(
    start
      ? { point: start, label: `${start.lat}, ${start.lng}` }
      : { point: { lat: ROOFS[0].lat, lng: ROOFS[0].lng }, label: ROOFS[0].label },
  );
  const [result, setResult] = useState<Result>({ kind: "loading" });
  const [configIndex, setConfigIndex] = useState(0);

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
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Map playground (dev only)</h1>

        <AddressSearch
          onSelect={(place) =>
            lookUp({ point: { lat: place.lat, lng: place.lng }, label: place.address || "the picked address", province: place.province })
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">Synthetic roofs:</span>
          {ROOFS.map((r) => (
            <button
              key={r.label}
              onClick={() => lookUp({ point: { lat: r.lat, lng: r.lng }, label: r.label })}
              aria-pressed={lookup.label === r.label}
              className={`rounded-full border px-3 py-1 text-sm ${
                lookup.label === r.label ? "border-indigo-700 bg-indigo-700 text-white" : "border-zinc-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div role="status" className="text-sm">
          <p className={result.kind === "error" ? "text-red-600" : result.kind === "empty" ? "text-amber-700" : ""}>
            {statusText(lookup, result)}
          </p>
          {outsideBC && (
            <p className="text-amber-700">
              This address looks like it&apos;s outside BC ({lookup.province}). Solmap uses BC Hydro rates.
            </p>
          )}
        </div>

        <SolarMap
          location={lookup.point}
          building={building}
          visibleCount={count}
          onMapClick={(point) => lookUp({ point, label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` })}
          className="h-[60vh] min-h-80"
        />

        {building &&
          (building.configs.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{sizeLabel}</span>
              <input
                type="range"
                min={0}
                max={building.configs.length - 1}
                value={configIndex}
                aria-valuetext={sizeLabel}
                onChange={(e) => setConfigIndex(Number(e.target.value))}
              />
            </label>
          ) : (
            <p className="text-sm">This roof is too small for any panel layout.</p>
          ))}
      </main>
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
