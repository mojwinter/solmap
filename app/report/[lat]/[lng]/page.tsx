import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from '@/components/report/ReportView';
import { parseReportQuery } from '@/components/report/urlState';

function parseCoord(raw: string, limit: number): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export const metadata: Metadata = { title: 'Your solar report · Sunscore' };

/** /report/49.25/-123.15?address=…&panels=&kwh=&plan= The URL is the whole state, so reports are shareable without a DB. */
export default async function ReportPage({ params, searchParams }: PageProps<'/report/[lat]/[lng]'>) {
  const { lat: rawLat, lng: rawLng } = await params;
  const lat = parseCoord(rawLat, 90);
  const lng = parseCoord(rawLng, 180);
  if (lat === null || lng === null) notFound();

  const query = parseReportQuery(await searchParams);
  return <ReportView lat={lat} lng={lng} address={query.address} query={query} />;
}
