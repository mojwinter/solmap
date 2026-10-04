/**
 * BC Hydro's logo: the double star in a ring, traced from their mark. Drawn in currentColor, centred on 0,0
 * with the viewBox fitted to the ring. Decorative, so it's hidden from screen readers; put the name in text nearby.
 */
export function BcHydroLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="-254 -254 508 508"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle r="241.25" fill="none" stroke="currentColor" strokeWidth="24.5" />
      <path d="M-59.5-178L-39.5-41A40.6 40.6 0 0 0 39.5-41L59.5-178L84.5-41C86.9-27.6 100.1-14.6 114.5-12L190.5 0L114.5 12C100.1 14.6 86.9 27.6 84.5 41L59.5 178L39.5 41A40.6 40.6 0 0 0-39.5 41L-59.5 178L-84.5 41C-86.9 27.6-100.1 14.6-114.5 12L-190.5 0L-114.5-12C-100.1-14.6-86.9-27.6-84.5-41Z" />
    </svg>
  );
}
