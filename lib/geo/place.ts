/**
 * A picked Places result → the few fields the app uses. Pure (no `google` global), so it runs in Node tests.
 */
import type { LatLngLiteral } from "@/src/types/app";

/** The parts of google.maps.places.Place we read, typed structurally so tests can pass plain objects. */
export interface PlaceLike {
  location?: { lat(): number; lng(): number } | null;
  formattedAddress?: string | null;
  addressComponents?: { types: string[]; shortText: string | null }[] | null;
}

export interface PickedPlace extends LatLngLiteral {
  address: string;
  /** Province/territory code from the address (e.g. "BC"), or null if Google didn't return one. */
  province: string | null;
}

/** null when the place has no usable location (nothing to look up). */
export function pickedPlace(place: PlaceLike): PickedPlace | null {
  const lat = place.location?.lat();
  const lng = place.location?.lng();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const province =
    place.addressComponents?.find((c) => c.types.includes("administrative_area_level_1"))?.shortText ?? null;
  return { lat: lat as number, lng: lng as number, address: place.formattedAddress ?? "", province };
}
