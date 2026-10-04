/**
 * Placeholder blocks while the roof loads, one per card round the house: `money` (payback, cost tiles
 * and reasons), `slider` (the size slider), `figures` (the four key-figure tiles, no card round them),
 * `chart` (a ChartSection: heading, a `plot` px tall, the legend row if `legend`, "See the numbers")
 * or `impact` (ImpactCard's heading and two tiles). Each keeps its card's height, so nothing moves
 * when the card replaces it.
 */
export function ReportSkeleton({
  variant = 'money',
  plot = 220,
  legend = false,
}: {
  variant?: 'money' | 'slider' | 'figures' | 'chart' | 'impact';
  /** `chart`: the plot's height in px (the chart's own h-[…]). */
  plot?: number;
  /** `chart`: the chart has a legend row under the plot. */
  legend?: boolean;
}) {
  const block = 'animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
  if (variant === 'chart') {
    // ChartSection's rows: text-headline (22px), the plot, text-callout rows (18px), gap-3.
    return (
      <div className="grid content-start gap-3" aria-busy="true" aria-label="Loading your roof">
        <div className="flex h-[22px] items-center">
          <div className={`${block} h-4 w-36`} />
        </div>
        <div className={`${block} opacity-60`} style={{ height: plot }} />
        {legend && (
          <div className="flex h-[18px] items-center">
            <div className={`${block} h-3 w-44`} />
          </div>
        )}
        <div className="flex h-[18px] items-center">
          <div className={`${block} h-3 w-28`} />
        </div>
      </div>
    );
  }
  if (variant === 'impact') {
    // ImpactCard: the 30px icon heading, then two tiles (p-3, an 18px label, a 28px number).
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Loading your roof">
        <div className="flex h-[30px] items-center gap-2">
          <div className={`${block} size-[30px] rounded-sm`} />
          <div className={`${block} h-4 w-40`} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className={`${block} h-[72px]`} />
          <div className={`${block} h-[72px]`} />
        </div>
      </div>
    );
  }
  if (variant === 'figures') {
    // KeyFigures' tiles: a text-metric number (28px) over a text-callout label (18px), p-3.5 gap-0.5;
    // four across or two by two, as it lays out.
    return (
      <div className="@container" aria-busy="true" aria-label="Loading your roof">
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card grid content-start gap-0.5 rounded-lg p-3.5">
              <div className="flex h-7 items-center">
                <div className={`${block} h-5 w-20`} />
              </div>
              <div className="flex h-[18px] items-center">
                <div className={`${block} h-3 w-16`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === 'slider') {
    // SizeSlider's rows (heading, panels and kWh, the value curve, steppers round the track, the
    // recommended line), so the cards under it don't move when it replaces this.
    return (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading your roof">
        <div className={`${block} h-[21px] w-24`} />
        <div className="flex h-9 items-center gap-5">
          <div className={`${block} h-8 w-24`} />
          <div className={`${block} h-8 w-44`} />
        </div>
        {/* The value curve over the track (76px), then the 28px track row the steppers sit beside. */}
        <div className="flex items-end gap-3">
          <div className={`${block} size-9 flex-none rounded-full pointer-coarse:size-10`} />
          <div className="flex h-[104px] flex-1 flex-col justify-between">
            <div className={`${block} mx-[13px] h-[72px] opacity-60`} />
            <div className="flex h-7 items-center">
              <div className={`${block} h-1.5 w-full rounded-pill`} />
            </div>
          </div>
          <div className={`${block} size-9 flex-none rounded-full pointer-coarse:size-10`} />
        </div>
        <div className={`${block} h-[18px] w-36`} />
      </div>
    );
  }
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading your roof">
      {/* PaybackHero and MoneyTiles' heights, so the card keeps its size when they replace this. */}
      <div className={`${block} h-[83px]`} />
      <div className="grid grid-cols-2 gap-2">
        <div className={`${block} h-[70px]`} />
        <div className={`${block} h-[70px]`} />
      </div>
    </div>
  );
}
