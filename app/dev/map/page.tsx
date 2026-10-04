import { notFound } from "next/navigation";
import { getFlags } from "@/lib/flags.server";
import { DevMap } from "./DevMap";

// Dev-only playground for components/map (A). Not part of the product; 404s in production builds.
// Optional ?lat=&lng= starts at any spot, e.g. /dev/map?lat=49.2827&lng=-123.1207 (no key needed).
export default async function DevMapPage({ searchParams }: PageProps<"/dev/map">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { lat, lng } = await searchParams;
  const number = (v: string | string[] | undefined) =>
    typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
  const start = number(lat) !== null && number(lng) !== null ? { lat: number(lat)!, lng: number(lng)! } : undefined;
  // The heatmap is a P1 feature behind the `heatmap` flag (on in dev unless SOLMAP_FLAGS says otherwise).
  const { heatmap } = await getFlags();
  return <DevMap start={start} heatmap={heatmap} />;
}
