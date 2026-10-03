"use client";

import type { ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";

/**
 * Browser key (HTTP-referrer restricted; Maps JavaScript API + Places API (New)). Empty in dev
 * without .env.local: the map then runs in Google's development mode and address search is off.
 */
export const MAPS_API_KEY = process.env.NEXT_PUBLIC_MAPS_API_KEY ?? "";

/** Loads the Maps JS API once for everything inside it (SolarMap, AddressSearch). One per page. */
export function MapsProvider({ children }: { children: ReactNode }) {
  return <APIProvider apiKey={MAPS_API_KEY}>{children}</APIProvider>;
}
