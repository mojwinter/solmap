import type { ReactNode } from 'react';
import { Card } from '../Card';

/**
 * The answer, top right: `children` is PaybackHero (the year and the verdict) and MoneyTiles. Money only,
 * no heading: the power figures (YearlyStats) live in the card under the house.
 * `plain`: no card of its own, for a surface that already is one (the explore map's glass panel).
 */
export function SolarPotential({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  const Surface = plain ? 'div' : Card;
  return (
    <Surface role="region" aria-label="Your solar potential" className="grid gap-4">
      {children}
    </Surface>
  );
}
