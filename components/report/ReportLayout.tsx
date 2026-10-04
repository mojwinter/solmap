import type { ReactNode } from 'react';
import { Wordmark } from '@/components/common/Wordmark';

/**
 * The house is the page: a fixed window on the roof with the report in cards round it, on the sky
 * ground (no map behind anything). Wide screens, two columns:
 *
 *   house     | summary
 *   analysis  | controls, extras…
 *
 * The right column runs on by itself, so its cards never wait for the house row to end. Narrower,
 * one column in reading order: house, summary, controls, analysis, extras (the right column's
 * wrapper is `display: contents` there, so its cards take their own place in the order).
 * Printed, the cards become plain blocks (globals.css) and the map hides.
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
  /** Top right: the answer. */
  summary?: ReactNode;
  /** Right, under the summary: what you can change (system size). */
  controls?: ReactNode;
  /** Under the house: the money in detail. */
  analysis?: ReactNode;
  /** The rest of the right column. */
  extras?: ReactNode;
  /** The P1 flags that are on, space-separated: ops and the E2E smoke test read data-flags. */
  flags?: string;
}) {
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
        className="relative mx-auto grid w-full max-w-[1320px] flex-1 content-start gap-5 px-4 pt-2 pb-10 sm:px-8 md:gap-6 print:block print:p-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-250"
      >
        {title}
        {notices}
        <div
          data-print-stack
          className="grid items-start gap-5 md:gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr] print:block"
        >
          <div className="order-1 min-w-0 xl:col-start-1 xl:row-start-1">{house}</div>
          <div
            data-print-stack
            className="contents xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:grid xl:content-start xl:gap-6 print:block"
          >
            {summary && <div className="order-2 min-w-0">{summary}</div>}
            {controls && <div className="order-3 min-w-0">{controls}</div>}
            {extras && <div className="order-5 grid min-w-0 gap-5 md:gap-6">{extras}</div>}
          </div>
          {analysis && <div className="order-4 min-w-0 xl:col-start-1 xl:row-start-2">{analysis}</div>}
        </div>
      </main>
    </div>
  );
}
