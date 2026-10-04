import type { ReactNode } from 'react';
import { Card } from '../Card';

/**
 * The answer, top right: `children` is PaybackHero (the year and the verdict) and the yearly stats.
 * `plain`: no card of its own, for a surface that already is one (the explore map's glass panel).
 */
export function SolarPotential({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  const Surface = plain ? 'div' : Card;
  return (
    <Surface className="grid gap-4">
      <h2 className="font-display text-metric">Your solar potential</h2>
      {children}
    </Surface>
  );
}
