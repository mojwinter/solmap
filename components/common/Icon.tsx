// The design system's line glyphs: 24px grid, 1.75 stroke, round caps, drawn in currentColor.
// Paths copied from the Solmap design system's Icon component; `ban`, `cloud`, `star`,
// `alert`, `refresh`, `info` and `sliders` are added in the same style for the report.
const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  roof: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  panels: 'M4 6h16l-2 10H6L4 6zM9.3 6l-.7 10M14.7 6l.7 10M5 11h14M12 16v4M8.5 20h7',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-12 14H5zM5 19l7-7',
  dollar: 'M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.3 1.3-4.3 3.2 0 4.4 9 2.4 9 6.8 0 2-1.9 3.3-4.7 3.3-2.3 0-4-.8-4.8-2.3',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  tilde: 'M5 13.5c2-3 4-3 7-1s5 2 7-1',
  x: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  locate: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  layers: 'M12 4 3 9l9 5 9-5-9-5zM3 14l9 5 9-5',
  chevron: 'M9 6l6 6-6 6',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  cloud: 'M7 18.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.6A3.2 3.2 0 0 0 7 18.5z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z',
  alert: 'M12 4 2.8 19.5h18.4L12 4zM12 10v4.5M12 17.2v.1',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.1',
  sliders: 'M4 7h9M17 7h3M15 4.5v5M4 17h3M11 17h9M9 14.5v5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  label,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Accessible name, only when the icon stands alone. Omit when a text label sits beside it. */
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
