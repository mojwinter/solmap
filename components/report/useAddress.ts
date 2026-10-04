'use client';

import { useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

const BUILDING_PREFIX = 'buildings/';
// BC's own address geocoder: free, no key, CORS-enabled, BC civic addresses (Open Government Licence – BC).
const BC_GEOCODER = 'https://geocoder.api.gov.bc.ca/sites/nearest.json';
// How far from the point a civic address may be and still count as this house's.
const MAX_DISTANCE_M = 50;
const tidy = (address: string) => address.replace(/, Canada$/, '');
// How long the header waits on the address before falling back to lat, lng.
const GIVE_UP_MS = 4000;

/**
 * The street address for the report header: the one the user picked, else the address of the building
 * the report is about (the Solar API names it `buildings/{place_id}`, so Places API (New) can look it up
 * with the browser key), else the nearest civic address to the point from the BC Address Geocoder.
 * `pending` while that lookup may still answer, so the header can show a skeleton instead of lat, lng.
 * A lookup that fails, finds nothing or takes over GIVE_UP_MS ends with no address: the header then
 * falls back to lat, lng. With no building id (no roof) there's no lookup and nothing pending.
 */
export function useAddress(
  lat: number,
  lng: number,
  picked?: string,
  buildingId?: string,
): { address?: string; pending: boolean } {
  const places = useMapsLibrary('places');
  // Tagged with the point and building it answers, so a new lookup never shows the last one's address.
  // A null address: the lookup finished without one.
  const [found, setFound] = useState<{ key: string; address: string | null } | null>(null);
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  const key = `${lat},${lng}|${buildingId ?? ''}`;

  // Never leave the header on a skeleton: the Maps library may never load (no browser key) or a
  // lookup may hang.
  useEffect(() => {
    if (picked || !buildingId) return;
    const timer = setTimeout(() => setGaveUp(key), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [picked, buildingId, key]);

  useEffect(() => {
    // The header only shows once the roof has loaded, so wait for its building id: one lookup per report.
    if (picked || !buildingId || !places) return;
    let live = true;

    const byPlace = async () => {
      if (!buildingId.startsWith(BUILDING_PREFIX)) return undefined;
      const place = new places.Place({ id: buildingId.slice(BUILDING_PREFIX.length) });
      await place.fetchFields({ fields: ['formattedAddress'] });
      return place.formattedAddress ?? undefined;
    };
    const byPoint = async () => {
      const res = await fetch(`${BC_GEOCODER}?point=${lng},${lat}&maxDistance=${MAX_DISTANCE_M}`);
      if (!res.ok) return undefined;
      // A Feature when there's an address in range, an empty FeatureCollection when there isn't.
      const body: { properties?: { fullAddress?: unknown } } = await res.json();
      const address = body.properties?.fullAddress;
      return typeof address === 'string' && address ? address : undefined;
    };

    byPlace()
      .catch(() => undefined)
      .then((address) => address ?? byPoint())
      .then((address) => {
        if (live) setFound({ key, address: address ? tidy(address) : null });
      })
      .catch(() => {
        if (live) setFound({ key, address: null });
      });
    return () => {
      live = false;
    };
  }, [places, key, lat, lng, picked, buildingId]);

  if (picked) return { address: picked, pending: false };
  const mine = found?.key === key ? found : null;
  return { address: mine?.address ?? undefined, pending: !!buildingId && !mine && gaveUp !== key };
}
