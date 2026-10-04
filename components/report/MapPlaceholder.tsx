/**
 * Sky ground in the house window, for the route-level loading and error screens (they don't know
 * the location yet). ReportView itself always shows the real <SolarMap>.
 */
export function MapPlaceholder() {
  return <div className="size-full bg-linear-to-b from-sky-200 via-sky-100 to-sky-050" aria-hidden />;
}
