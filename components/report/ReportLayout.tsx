import type { ReactNode } from 'react';
import { Wordmark } from '@/components/common/Wordmark';

/** A card in one of the two column stacks. `order` is its place in the one-column (phone) reading order. */
export interface LayoutBlock {
  key: string;
  order: number;
  node: ReactNode;
}

/**
 * The house is the page: a fixed window on the roof with the report in cards round it, on the sky
 * ground (no map behind anything). From 1024px, two independent stacks, so a short card never leaves
 * a gap beside a tall one:
 *
 *   main (wide): house, analysis, then `main` blocks
 *   side (360–400px): summary, controls, then `side` blocks, then extras
 *
 * Narrower, the stacks dissolve (`display: contents`) into one column sorted by each block's `order`
 * (house 1, summary 2, controls 3, analysis 4, extras 90). `details` runs full width under both, then
 * `footer`. Printed, it's one column in that same order, and the map hides.
 */
export function ReportLayout({
  search,
  title,
  notices,
  house,
  summary,
  controls,
  analysis,
  extras,
  main = [],
  side = [],
  details,
  footer,
  flags,
}: {
  /** Top bar, right end: looking up another address. */
  search?: ReactNode;
  /** The address and its badges. */
  title?: ReactNode;
  /** Banners that apply to the whole report. */
  notices?: ReactNode;
  /** The house window card. */
  house: ReactNode;
  /** Top of the side column: the answer. */
  summary?: ReactNode;
  /** Side, under the summary: what you can change (system size, usage). */
  controls?: ReactNode;
  /** Main, under the house. */
  analysis?: ReactNode;
  /** The end of the side column. */
  extras?: ReactNode;
  /** More cards for the main (wide) stack. */
  main?: LayoutBlock[];
  /** More cards for the side stack. */
  side?: LayoutBlock[];
  /** Full width under both stacks. */
  details?: ReactNode;
  /** Last line of the page: sources and attribution. */
  footer?: ReactNode;
  /** The P1 flags that are on, space-separated: ops and the E2E smoke test read data-flags. */
  flags?: string;
}) {
  const mainBlocks: LayoutBlock[] = [
    { key: 'house', order: 1, node: house },
    ...(analysis ? [{ key: 'analysis', order: 4, node: analysis }] : []),
    ...main,
  ];
  const sideBlocks: LayoutBlock[] = [
    ...(summary ? [{ key: 'summary', order: 2, node: summary }] : []),
    ...(controls ? [{ key: 'controls', order: 3, node: controls }] : []),
    ...side,
    ...(extras ? [{ key: 'extras', order: 90, node: <div className="grid gap-5 md:gap-6">{extras}</div> }] : []),
  ];
  const stack = (blocks: LayoutBlock[]) =>
    [...blocks]
      .sort((a, b) => a.order - b.order)
      .map((b) => (
        <div key={b.key} className="min-w-0" style={{ order: b.order }}>
          {b.node}
        </div>
      ));

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-linear-to-b from-sky-200 via-sky-100 via-30% to-sky-050 print:bg-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 size-[440px] rounded-full bg-[radial-gradient(circle,var(--sun-300)_0%,transparent_68%)] opacity-70 print:hidden"
      />

      <header className="relative mx-auto flex min-h-[68px] w-full max-w-[1320px] items-center justify-between gap-4 px-4 py-3 sm:min-h-[84px] sm:px-8 sm:py-5 print:hidden">
        <Wordmark href="/" />
        {search}
      </header>

      <main
        aria-label="Solar report"
        data-flags={flags}
        className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 px-4 pt-2 pb-10 sm:px-8 md:gap-6 print:block print:p-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250"
      >
        {title}
        {notices}
        {/* Printed: one flex column, so the blocks keep their reading order (order needs a flex/grid parent). */}
        <div
          data-print-stack
          className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] print:flex print:flex-col print:items-stretch print:gap-6"
        >
          <div className="contents lg:grid lg:min-w-0 lg:content-start lg:gap-6 print:contents">{stack(mainBlocks)}</div>
          <div className="contents lg:grid lg:min-w-0 lg:content-start lg:gap-6 print:contents">{stack(sideBlocks)}</div>
        </div>
        {details}
        {footer}
      </main>
    </div>
  );
}
