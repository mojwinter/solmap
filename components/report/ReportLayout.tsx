import type { ReactNode } from 'react';

/**
 * The map is the canvas: full screen on desktop with the results panel floating on the right.
 * On phones the map sits on top and the panel rises over its bottom edge, verdict first.
 */
export function ReportLayout({ map, children }: { map: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-1 flex-col md:block">
      <div className="h-[34dvh] md:fixed md:inset-0 md:h-auto">{map}</div>
      <aside
        aria-label="Solar report"
        className="relative z-10 -mt-6 flex-1 rounded-t-xl glass p-5 md:absolute md:top-6 md:right-6 md:mt-0 md:max-h-[calc(100dvh-3rem)] md:w-[440px] md:flex-none md:overflow-y-auto md:rounded-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-250"
      >
        {children}
      </aside>
    </div>
  );
}
