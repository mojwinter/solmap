"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { pickedPlace, type PickedPlace } from "@/lib/geo/place";
import { BC_BOUNDS } from "@/src/config/bc";
import { MAPS_API_KEY } from "./MapsProvider";

interface Props {
  /** Called with the picked address's location (full precision; round it for URLs). */
  onSelect: (place: PickedPlace) => void;
  placeholder?: string;
  className?: string;
}

// The same box /api/solar/building validates against, so every suggestion is a lookup the API accepts.
const BC_BOX: google.maps.LatLngBoundsLiteral = {
  south: BC_BOUNDS.latMin,
  west: BC_BOUNDS.lngMin,
  north: BC_BOUNDS.latMax,
  east: BC_BOUNDS.lngMax,
};

/**
 * Address box built on Google's PlaceAutocompleteElement (Places API (New); docs/SOLAR_API.md,
 * Gotcha 8). Suggestions are limited to Canada inside BC's box. Must sit inside <MapsProvider>.
 */
export function AddressSearch({ onSelect, placeholder = "Enter your address", className }: Props) {
  const places = useMapsLibrary("places");
  const container = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = useEffectEvent(async (prediction: google.maps.places.PlacePrediction) => {
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
      const picked = pickedPlace(place);
      if (!picked) {
        setProblem("That result has no location. Try a street address.");
        return;
      }
      setProblem(null);
      onSelect(picked);
    } catch (e) {
      console.error("AddressSearch: couldn't fetch the picked place", e);
      setProblem("Couldn't look up that address. Try again.");
    }
  });

  useEffect(() => {
    const host = container.current;
    if (!places || !host) return;
    const element = new places.PlaceAutocompleteElement({
      includedRegionCodes: ["ca"],
      locationRestriction: BC_BOX,
      placeholder,
    });
    element.style.width = "100%";
    const onPick = (event: google.maps.places.PlacePredictionSelectEvent) => void pick(event.placePrediction);
    const onError = () => setProblem("Address search isn't available right now.");
    element.addEventListener("gmp-select", onPick);
    element.addEventListener("gmp-error", onError);
    host.append(element);
    return () => {
      element.removeEventListener("gmp-select", onPick);
      element.removeEventListener("gmp-error", onError);
      element.remove();
    };
  }, [places, placeholder]);

  if (!MAPS_API_KEY) {
    return (
      <div className={className}>
        <input
          disabled
          placeholder={placeholder}
          aria-label="Address"
          className="w-full rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {process.env.NODE_ENV === "production"
            ? "Address search isn't available right now."
            : "Address search needs NEXT_PUBLIC_MAPS_API_KEY (Maps JavaScript API + Places API (New)) in .env.local."}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={container} />
      {problem && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}
