'use client';

import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

/**
 * The street address for the report header: the one the user picked, else a reverse geocode of the
 * point (a click on the map or a link without `?address=`). Needs the Geocoding API on the browser key;
 * without it (or with no street result) this stays undefined and the header falls back.
 */
export function useAddress(lat: number, lng: number, picked?: string): string | undefined {
  const geocoding = useMapsLibrary('geocoding');
  // Tagged with the point it answers, so a new point never shows the last one's address.
  const [found, setFound] = useState<{ key: string; address: string } | null>(null);
  const key = `${lat},${lng}`;

  useEffect(() => {
    if (picked || !geocoding) return;
    let live = true;
    new geocoding.Geocoder()
      .geocode({ location: { lat, lng } })
      .then(({ results }) => {
        const best = results.find((r) => r.types.includes('street_address') || r.types.includes('premise')) ?? results[0];
        if (live && best) setFound({ key, address: best.formatted_address.replace(/, Canada$/, '') });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [geocoding, key, lat, lng, picked]);

  return picked ?? (found?.key === key ? found.address : undefined);
}
