/**
 * Placeholder blocks while the roof loads, one per column beside the house: `money` (payback and
 * cost tiles) or `list` (the yearly list).
 */
export function ReportSkeleton({ variant = 'money' }: { variant?: 'money' | 'list' }) {
  const block = 'animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
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
