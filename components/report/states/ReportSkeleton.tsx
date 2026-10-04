/**
 * Placeholder blocks while the roof loads, one per card round the house: `money` (payback, cost tiles
 * and reasons), `slider` (the size slider) or `figures` (the four key-figure tiles, no card round them).
 */
export function ReportSkeleton({ variant = 'money' }: { variant?: 'money' | 'slider' | 'figures' }) {
  const block = 'animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
  if (variant === 'figures') {
    // KeyFigures' tiles: label, number, meter, note; four across or two by two, as it lays out.
    return (
      <div className="@container" aria-busy="true" aria-label="Loading your roof">
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card grid gap-2 rounded-lg p-4">
              <div className={`${block} h-[18px] w-24`} />
              <div className={`${block} h-7 w-20`} />
              <div className={`${block} h-1.5 rounded-pill`} />
              <div className={`${block} h-3.5 w-28`} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (variant === 'slider') {
    // SizeSlider's rows (heading, the panels / kWh tiles, the value curve, steppers round the track, the
    // recommended line), so the cards under it don't move when it replaces this.
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Loading your roof">
        <div className={`${block} h-[22px] w-28`} />
        <div className="grid grid-cols-2 gap-2">
          <div className={`${block} h-[94px]`} />
          <div className={`${block} h-[94px]`} />
        </div>
        {/* The value curve over the track (pt-8), then the 28px track row the steppers sit beside. */}
        <div className="flex items-end gap-3">
          <div className={`${block} size-9 flex-none rounded-full pointer-coarse:size-10`} />
          <div className="flex h-[60px] flex-1 flex-col justify-between">
            <div className={`${block} mx-[13px] h-7 opacity-60`} />
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
