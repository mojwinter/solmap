import Link from 'next/link';

/** The Sunscore mark: a sun dot with its halo and the name. Pass `href` to make it a link home. */
export function Wordmark({ href }: { href?: string }) {
  const mark = (
    <>
      <span aria-hidden="true" className="ml-1 size-[22px] rounded-full bg-sun-500 ring-4 ring-sun-300" />
      Sunscore
    </>
  );
  const className = 'inline-flex items-center gap-2 text-headline';
  return href ? (
    <Link
      href={href}
      className={`${className} rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring`}
    >
      {mark}
    </Link>
  ) : (
    <span className={className}>{mark}</span>
  );
}
