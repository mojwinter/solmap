import type { ReactNode } from 'react';
import { Card } from './Card';

/**
 * The window on the house: give this to the map (SolarMap's `className`, or MapPlaceholder's
 * wrapper) so every state frames the roof the same size. Square-ish on phones, wider above.
 * Corners nest inside the card's (xl card, p-2 → lg window). The map doesn't print.
 */
export const HOUSE_WINDOW_SIZE = 'h-[min(86vw,400px)] md:h-[460px] xl:h-[520px]';
export const HOUSE_WINDOW = `${HOUSE_WINDOW_SIZE} overflow-hidden rounded-lg print:hidden`;

/** The card round the window; the map's footer (size, layer, source) sits inside it under the imagery. */
export function HouseCard({ children }: { children: ReactNode }) {
  return <Card className="p-2 print:p-0">{children}</Card>;
}
