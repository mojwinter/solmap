/** 6 decimals ≈ 11 cm: plenty for a roof, and keeps report URLs short and stable. */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** /report/{lat}/{lng}?address=… for a picked place or an example roof. */
export function reportHref(lat: number, lng: number, address?: string): string {
  const path = `/report/${round6(lat)}/${round6(lng)}`;
  return address ? `${path}?address=${encodeURIComponent(address)}` : path;
}
