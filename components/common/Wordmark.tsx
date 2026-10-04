import Link from 'next/link';

/**
 * The Sunscore mark: a line-drawn sun rising behind a roof. Same lines as app/icon.svg (the tab icon),
 * without its blue tile, so keep the two in step. Drawn in currentColor so it takes the name's ink colour.
 * The viewBox is cropped to the lines, and the stroke is a little heavier so it holds its own next to the name.
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
      <path d="M20.5 29 A11.5 11.5 0 0 1 43.5 29" />
      <path d="M32 11 L32 6.5 M44.73 16.27 L47.91 13.09 M19.27 16.27 L16.09 13.09 M49.73 25.87 L54.16 25.09 M14.27 25.87 L9.84 25.09" />
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
      <SunscoreMark className="size-8 shrink-0" />
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
