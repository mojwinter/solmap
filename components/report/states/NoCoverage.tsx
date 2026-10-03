import Link from 'next/link';
import { Icon } from '@/components/common/Icon';

// The committed synthetic roofs (CLAUDE.md → SOLAR_SOURCE). Swap for the live demo addresses at #23.
const EXAMPLES = [
  { href: '/report/49.25/-123.15', label: 'A sunny south-facing roof' },
  { href: '/report/49.2615/-123.1702', label: 'A shaded roof' },
];

const COPY = {
  no_coverage: {
    title: 'We can’t see this roof yet',
    body: 'We don’t have roof imagery for this address yet. Try one of these example roofs instead:',
  },
  outside_bc: {
    title: 'This tool covers BC only',
    body: 'Solmap uses BC Hydro rates and rebates, and this spot looks like it’s outside BC. Try one of these example roofs instead:',
  },
};

/**
 * No report possible for this spot: no imagery (404) or outside BC. P0 offers example roofs;
 * the manual estimate is P1 (#31).
 */
export function NoCoverage({ reason = 'no_coverage' }: { reason?: keyof typeof COPY }) {
  const copy = COPY[reason];
  return (
    <section className="grid gap-3">
      <span className="grid size-[30px] place-items-center rounded-sm bg-fill-quiet text-ink-secondary">
        <Icon name="roof" size={18} />
      </span>
      <h2 className="font-display text-title">{copy.title}</h2>
      <p className="text-body text-ink-secondary">{copy.body}</p>
      <ul className="rounded-md bg-fill-quiet px-3">
        {EXAMPLES.map((e) => (
          <li key={e.href} className="border-separator not-first:border-t">
            <Link
              href={e.href}
              className="flex items-center justify-between py-3 text-headline text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {e.label}
              <Icon name="chevron" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
