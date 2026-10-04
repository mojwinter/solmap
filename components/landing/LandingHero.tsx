import { Wordmark } from '@/components/common/Wordmark';
import { Disclaimer } from './Disclaimer';
import { ExampleChips } from './ExampleChips';
import { LandingSearch } from './LandingSearch';

/**
 * Daylight LandingHero: sky gradient with a soft sun glow off the top-right, the one display-xl
 * headline, one body line, the bare address search as the only call to action, then example roofs.
 */
export function LandingHero() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-linear-to-b from-sky-200 via-sky-100 via-45% to-sky-050">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-28 size-[360px] sm:-top-40 sm:-right-30 sm:size-[520px] rounded-full bg-[radial-gradient(circle,var(--sun-300)_0%,transparent_68%)]"
      />

      <header className="relative px-4 py-4 sm:px-8">
        <Wordmark />
      </header>

      <main className="relative mx-auto flex w-full max-w-[760px] flex-1 flex-col px-4 pt-12 pb-8 sm:px-8 sm:pt-[72px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-250">
        <h1 className="text-center font-display text-display text-balance sm:text-display-xl">
          Is solar worth it on your roof?
        </h1>
        <p className="mx-auto mt-4 mb-8 max-w-[520px] text-center text-body text-ink-secondary">
          Find out under BC&rsquo;s new 2026 rules: how many panels fit, what they cost after the rebate, and the
          year they pay for themselves.
        </p>
        <LandingSearch />
        <div className="mt-8">
          <ExampleChips />
        </div>
        <footer className="mt-auto pt-12">
          <Disclaimer />
        </footer>
      </main>
    </div>
  );
}
