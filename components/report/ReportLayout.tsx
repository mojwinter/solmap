import type { ReactNode } from 'react';

/**
 * The map is the canvas: full screen on desktop with the results panel floating on the right and
 * the address search floating top-left (Daylight MapScreen). On phones the map is a strip on top
 * with the search over it, and the panel rises over its bottom edge, verdict first. Printed, only the
 * panel remains, as a plain page.
 */
export function ReportLayout({ map, search, children }: { map: ReactNode; search?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col md:block">
      {/* The map doesn't print (tiles and overlays are unreliable on paper); the spec sheet lists the roof faces. */}
      <div className="relative h-[40dvh] md:fixed md:inset-0 md:h-auto print:hidden">
        {map}
        {search && (
          <div className="absolute top-4 right-4 left-4 md:top-6 md:right-auto md:left-6 md:w-[360px]">{search}</div>
        )}
      </div>
      {/* Desktop: the rounded card clips and an inner area scrolls, inset 20px top and bottom (the
          card's py-5), so the scrollbar never runs into the curved corners. Firefox doesn't clip a
          scroller's own scrollbar to its border-radius, so it used to poke out at the top. */}
      <aside
        aria-label="Solar report"
        className="relative z-10 -mt-6 flex flex-1 flex-col rounded-t-xl glass py-5 md:absolute md:top-6 md:right-6 md:mt-0 md:max-h-[calc(100dvh-3rem)] md:w-[440px] md:flex-none md:overflow-hidden md:rounded-xl print:static print:mt-0 print:max-h-none print:w-auto print:overflow-visible print:rounded-none print:py-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-250"
      >
        <div className="px-5 md:min-h-0 md:flex-1 md:overflow-y-auto md:[scrollbar-width:thin] print:overflow-visible print:px-0">
          {children}
        </div>
      </aside>
    </div>
  );
}
