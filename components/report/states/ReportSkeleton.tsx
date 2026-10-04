/**
 * Placeholder blocks while the roof loads, one per card round the house: `money` (payback and cost
 * tiles), `slider` (the size slider) or `list` (the yearly list).
 */
export function ReportSkeleton({ variant = 'money' }: { variant?: 'money' | 'slider' | 'list' }) {
  const block = 'animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
  if (variant === 'slider') {
    // SizeSlider's rows (heading and size, steppers round the track, the recommended line), so the
    // cards under it don't move when it replaces this.
    return (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading your roof">
        <div className="flex h-7 items-center justify-between gap-2">
          <div className={`${block} h-[21px] w-24`} />
          <div className={`${block} h-7 w-32`} />
        </div>
        <div className="flex items-center gap-3">
          <div className={`${block} size-9 flex-none rounded-full pointer-coarse:size-10`} />
          <div className={`${block} h-1.5 flex-1 rounded-pill`} />
          <div className={`${block} size-9 flex-none rounded-full pointer-coarse:size-10`} />
        </div>
        <div className={`${block} h-[18px] w-36`} />
      </div>
    );
  }
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading your roof">
      {variant === 'money' ? (
        <>
          {/* PaybackHero and MoneyTiles' heights, so the card doesn't resize when they replace this. */}
          <div className={`${block} h-[78px]`} />
          <div className="grid grid-cols-2 gap-2">
            <div className={`${block} h-[70px]`} />
            <div className={`${block} h-[70px]`} />
          </div>
        </>
      ) : (
        <>
          <div className={`${block} h-6 w-1/3`} />
          <div className={`${block} h-40`} />
        </>
      )}
    </div>
  );
}
