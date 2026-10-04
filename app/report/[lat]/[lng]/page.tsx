import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportView } from '@/components/report/ReportView';
import { getFlags } from '@/lib/flags.server';

function parseCoord(raw: string, limit: number): number | null {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

export const metadata: Metadata = { title: 'Your solar report · Solmap' };

/** /report/49.25/-123.15?address=… The URL is the whole state, so reports are shareable without a DB. */
export default async function ReportPage({ params, searchParams }: PageProps<'/report/[lat]/[lng]'>) {
  const { lat: rawLat, lng: rawLng } = await params;
  const lat = parseCoord(rawLat, 90);
  const lng = parseCoord(rawLng, 180);
  if (lat === null || lng === null) notFound();

  const { address } = await searchParams;
  const label = typeof address === 'string' && address.trim() ? address.trim().slice(0, 120) : undefined;
  // P1 features render only when their flag is on (docs/INFRA.md → Feature flags; all off on prod by default).
  const flags = await getFlags();

  return <ReportView lat={lat} lng={lng} address={label} flags={flags} />;
}
