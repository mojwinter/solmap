'use client';

import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

const BUILDING_PREFIX = 'buildings/';
const tidy = (address: string) => address.replace(/, Canada$/, '');

/**
 * The street address for the report header: the one the user picked, else the address of the building
 * the report is about (the Solar API names it `buildings/{place_id}`, so Places API (New) can look it up
 * with the browser key), else a reverse geocode of the point (needs the Geocoding API on the browser key).
 * Synthetic roofs and failed lookups leave this undefined and the header falls back.
 */
export function useAddress(lat: number, lng: number, picked?: string, buildingId?: string): string | undefined {
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  // Tagged with the point and building it answers, so a new lookup never shows the last one's address.
  const [found, setFound] = useState<{ key: string; address: string } | null>(null);
  const key = `${lat},${lng}|${buildingId ?? ''}`;

  useEffect(() => {
    // The header only shows once the roof has loaded, so wait for its building id: one lookup per report.
    if (picked || !buildingId || !places || !geocoding) return;
    let live = true;

    const byPlace = async () => {
      if (!buildingId.startsWith(BUILDING_PREFIX)) return undefined;
      const place = new places.Place({ id: buildingId.slice(BUILDING_PREFIX.length) });
      await place.fetchFields({ fields: ['formattedAddress'] });
      return place.formattedAddress ?? undefined;
    };
    const byPoint = async () => {
      const { results } = await new geocoding.Geocoder().geocode({ location: { lat, lng } });
      const best = results.find((r) => r.types.includes('street_address') || r.types.includes('premise')) ?? results[0];
      return best?.formatted_address;
    };

    byPlace()
      .catch(() => undefined)
      .then((address) => address ?? byPoint())
      .then((address) => {
        if (live && address) setFound({ key, address: tidy(address) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [places, geocoding, key, lat, lng, picked, buildingId]);

  return picked ?? (found?.key === key ? found.address : undefined);
}
