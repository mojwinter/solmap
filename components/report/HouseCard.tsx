import type { ReactNode } from 'react';
import { Card } from './Card';

/**
 * The window on the house: give this to the map (SolarMap's `className`, or MapPlaceholder's
 * wrapper) so every state frames the roof the same size. Square-ish on phones, wider above.
 * The window fills the card edge to edge: its corners are the card's (--radius-xl), less the card's
 * 1px border. Google's WebGL map can escape an overflow + border-radius clip in Chrome, so the
 * window that holds the live map also clips with HOUSE_WINDOW_CLIP and HOUSE_WINDOW_MASK. The map
 * doesn't print.
 */
export const HOUSE_WINDOW_SIZE = 'h-[min(86vw,400px)] md:h-[460px] xl:h-[520px]';
export const HOUSE_WINDOW_RADIUS = 'rounded-[23px]';
/** The same corners as a clip-path, which clips composited layers (the map's canvas) too. */
export const HOUSE_WINDOW_CLIP = 'inset(0 round 23px)';
/**
 * The same corners again as a mask: four quarter circles and two crossing bars. The clip alone still
 * lets the map's canvas through square at a corner when it redraws (each size slider step); a mask
 * flattens everything inside into one layer first, so nothing gets past it.
 */
export const HOUSE_WINDOW_MASK = [
  'linear-gradient(#000 0 0) center / calc(100% - 46px) 100% no-repeat',
  'linear-gradient(#000 0 0) center / 100% calc(100% - 46px) no-repeat',
  ...(
    [
      ['100% 100%', 'top left'],
      ['0 100%', 'top right'],
      ['100% 0', 'bottom left'],
      ['0 0', 'bottom right'],
    ] as const
  ).map(([at, corner]) => `radial-gradient(circle at ${at}, #000 22.5px, #0000 23.5px) ${corner} / 23px 23px no-repeat`),
].join(', ');
export const HOUSE_WINDOW = `${HOUSE_WINDOW_SIZE} overflow-hidden ${HOUSE_WINDOW_RADIUS} print:hidden`;

/** The card round the window, which fills it edge to edge. */
export function HouseCard({ children }: { children: ReactNode }) {
  return <Card className="p-0">{children}</Card>;
}
