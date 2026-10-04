/** Placeholder blocks in the results panel while the roof loads. */
export function ReportSkeleton() {
  const block = 'animate-pulse rounded-md bg-fill-quiet motion-reduce:animate-none';
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading your roof">
      <div className={`${block} h-8 w-2/3`} />
      <div className={`${block} h-28`} />
      <div className={`${block} h-24`} />
      <div className={`${block} h-12`} />
      <div className="grid grid-cols-2 gap-3">
        <div className={`${block} h-16`} />
        <div className={`${block} h-16`} />
        <div className={`${block} h-16`} />
        <div className={`${block} h-16`} />
      </div>
    </div>
  );
}
