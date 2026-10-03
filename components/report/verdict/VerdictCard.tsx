import type { Recommendation } from '@/src/types/app';
import { ReasonChips } from './ReasonChips';
import { VerdictBadge } from './VerdictBadge';

/** The hero: verdict for the recommended size, C's one-sentence headline and the top reasons. */
export function VerdictCard({ recommendation }: { recommendation: Pick<Recommendation, 'verdict' | 'headline' | 'reasons'> }) {
  return (
    <section aria-labelledby="verdict-heading" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="verdict-heading" className="text-callout text-ink-secondary">
          Is solar worth it here?
        </h2>
        <VerdictBadge verdict={recommendation.verdict} />
      </div>
      <p className="font-display text-headline text-balance">{recommendation.headline}</p>
      <ReasonChips reasons={recommendation.reasons} />
    </section>
  );
}
