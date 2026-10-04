"use client";

import { useEffect, useState } from "react";
import { SolarMap } from "@/components/map/SolarMap";
import type { BuildingResponse } from "@/src/types/app";

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

export function DevMap() {
  const [roof, setRoof] = useState(ROOFS[0]);
  const [building, setBuilding] = useState<BuildingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configIndex, setConfigIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/solar/building?lat=${roof.lat}&lng=${roof.lng}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setBuilding(null);
          setError(`${res.status} ${body.error ?? ""} ${body.message ?? ""}`);
          return;
        }
        setError(null);
        setBuilding(body);
        setConfigIndex(body.configs.length - 1);
      })
      .catch((e) => {
        if (cancelled) return;
        setBuilding(null);
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [roof]);

  const config = building?.configs[configIndex];
  const count = config?.panelsCount ?? 0;
  const kw = building ? (count * building.panel.capacityWatts) / 1000 : 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Map playground (dev only)</h1>

      <div className="flex flex-wrap gap-2">
        {ROOFS.map((r) => (
          <button
            key={r.label}
            onClick={() => setRoof(r)}
            aria-pressed={r === roof}
            className={`rounded-full border px-3 py-1 text-sm ${
              r === roof ? "border-indigo-700 bg-indigo-700 text-white" : "border-zinc-300"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {building && (
        <>
          <SolarMap building={building} visibleCount={count} className="h-[60vh] min-h-80" />

          {building.configs.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span>
                <b>{count}</b> panels · {kw.toFixed(1)} kW · {Math.round(config?.yearlyEnergyDcKwh ?? 0).toLocaleString()} kWh/yr (DC)
              </span>
              <input
                type="range"
                min={0}
                max={building.configs.length - 1}
                value={configIndex}
                onChange={(e) => setConfigIndex(Number(e.target.value))}
              />
            </label>
          ) : (
            <p className="text-sm">This roof is too small for any panel layout.</p>
          )}

          <p className="text-xs text-zinc-500">
            {building.panels.length} panels on {building.segments.length} roof segments · imagery {building.imagery.quality}
          </p>
        </>
      )}
    </main>
  );
}
