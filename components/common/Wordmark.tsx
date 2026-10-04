import Link from 'next/link';
import { useId } from 'react';

/**
 * The Sunscore app icon: the sun rising behind a roof. Same drawing and colours as app/icon.svg
 * (the tab icon), so keep the two in step. Fixed hex rather than tokens: a logo doesn't change in Dusk.
 */
function SunscoreMark({ className }: { className?: string }) {
  // Scoped ids (the mark can appear more than once on a page), stripped to characters url(#…) accepts.
  const id = `sunscore-mark${useId().replace(/[^\w-]/g, '')}`;
  const sky = `${id}-sky`;
  const tile = `${id}-tile`;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5cb8ff" />
          <stop offset="1" stopColor="#0a6fd8" />
        </linearGradient>
        <clipPath id={tile}>
          <rect width="64" height="64" rx="14" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${tile})`}>
        <rect width="64" height="64" fill={`url(#${sky})`} />
        <circle cx="32" cy="25" r="15.5" fill="#ffe066" />
        <circle cx="32" cy="25" r="11" fill="#ffb800" />
        <path d="M14 66 V47 L32 33 L50 47 V66 Z" fill="#0b1d33" />
        <path
          d="M7 52 L32 32.5 L57 52"
          fill="none"
          stroke="#ffffff"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** The Sunscore mark (the app icon) and the name. Pass `href` to make it a link home. */
export function Wordmark({ href }: { href?: string }) {
  const mark = (
    <>
      <SunscoreMark className="size-[30px] shrink-0" />
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
