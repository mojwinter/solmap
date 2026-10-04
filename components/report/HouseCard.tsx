import type { ReactNode } from 'react';
import { Card } from './Card';

/**
 * The window on the house: give this to the map (SolarMap's `className`, or MapPlaceholder's
 * wrapper) so every state frames the roof the same size. Square-ish on phones, wider above.
 * The window fills the card edge to edge: its corners are the card's, less the card's 1px border.
 * The map doesn't print.
 */
export const HOUSE_WINDOW_SIZE = 'h-[min(86vw,400px)] md:h-[460px] xl:h-[520px]';
export const HOUSE_WINDOW_RADIUS = 'rounded-[29px]';
export const HOUSE_WINDOW = `${HOUSE_WINDOW_SIZE} overflow-hidden ${HOUSE_WINDOW_RADIUS} print:hidden`;

/** The card round the window, which fills it edge to edge. */
export function HouseCard({ children }: { children: ReactNode }) {
  return <Card className="p-0">{children}</Card>;
}
