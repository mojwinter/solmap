import { notFound } from "next/navigation";
import { DevMap } from "./DevMap";

// Dev-only playground for components/map (A). Not part of the product; 404s in production builds.
export default function DevMapPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevMap />;
}
