'use client';

import { Icon } from '@/components/common/Icon';

/**
 * #33. `PrintButton` opens the browser's print dialog, where "Save as PDF" lives (a CSS print
 * stylesheet, not a PDF library: PLAN.md). `PrintHeader` shows only on paper:
 * where the report came from and the link back to it, so an installer can open the same numbers.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      aria-label="Save as PDF"
      title="Save as PDF"
      className="inline-flex items-center gap-1.5 rounded-pill bg-fill-quiet px-2.5 py-1 sm:px-3 text-callout font-semibold text-sky-700 hover:bg-fill-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden"
    >
      <Icon name="layers" size={14} />
      <span className="hidden sm:inline">Save as PDF</span>
    </button>
  );
}

export function PrintHeader() {
  // The report only renders in the browser (the roof is fetched client-side), so window is there.
  const url = typeof window === 'undefined' ? '' : window.location.href;
  const date = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <div className="hidden border-b border-separator pb-2 text-footnote text-ink-secondary print:block">
      <p className="font-semibold text-ink">Sunscore solar report · {date}</p>
      <p className="break-all">{url}</p>
      <p>Estimate, not a quote. Check the numbers with a BC Hydro HPCN installer.</p>
    </div>
  );
}
