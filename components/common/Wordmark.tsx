import Link from 'next/link';

/**
 * The Sunscore mark: a line-drawn sun rising behind a roof. Same lines as app/icon.svg (the tab icon),
 * without its blue tile, so keep the two in step. Drawn in currentColor, with the viewBox cropped to the
 * lines and a slightly heavier stroke so it holds its own next to the semibold name.
 */
function SunscoreMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="6 4.5 52 53.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M19 29 A13 13 0 0 1 45 29" />
      <path d="M32 11.5 V6.5 M44.37 16.63 L47.91 13.09 M19.63 16.63 L16.09 13.09 M49.23 25.96 L54.16 25.09 M14.77 25.96 L9.84 25.09" />
      <path d="M8 47 L32 29 L56 47" />
      <path d="M16 41 V56 H48 V41" />
      <path d="M32 29 V56" />
    </svg>
  );
}

/** The Sunscore mark and the name. Pass `href` to make it a link home. */
export function Wordmark({ href }: { href?: string }) {
  const mark = (
    <>
      <SunscoreMark className="size-8 shrink-0 text-sky-600" />
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
