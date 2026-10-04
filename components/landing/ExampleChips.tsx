import Link from 'next/link';
import { Icon, type IconName } from '@/components/common/Icon';
import demos from '@/fixtures/demo-addresses.json';
import { reportHref } from './reportHref';

// Switch to `demos.live` once its addresses are filled in and warmed (fixtures/demo-addresses.json → note).
const DEMOS: { lat: number; lng: number; address?: string; expectedVerdict: string }[] = demos.fixtures;

// One chip per story, picked by the outcome it shows, so the friendly labels survive the switch to `live`.
const CHIPS: { verdict: string; label: string; icon: IconName }[] = [
  { verdict: 'strong', label: 'A sunny south-facing roof', icon: 'sun' },
  { verdict: 'weak', label: 'A shaded roof', icon: 'roof' },
  { verdict: 'NO_COVERAGE', label: 'A roof we can’t see yet', icon: 'pin' },
];

/** "Try:" pills under the search that open pre-verified demo roofs. */
export function ExampleChips() {
  const chips = CHIPS.flatMap((c) => {
    const d = DEMOS.find((x) => x.expectedVerdict === c.verdict);
    return d ? [{ ...c, href: reportHref(d.lat, d.lng, d.address) }] : [];
  });

  return (
    <nav aria-label="Example roofs" className="flex flex-wrap items-center justify-center gap-2">
      <span className="w-full text-center text-callout text-ink-secondary">Or try an example</span>
      {chips.map((c) => (
        <Link
          key={c.verdict}
          href={c.href}
          className="inline-flex min-h-10 items-center gap-2 rounded-pill glass-thin py-1.5 pr-4 pl-1.5 text-callout text-ink transition-transform hover:bg-sky-050 active:scale-[.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none"
        >
          <span className="grid size-7 place-items-center rounded-pill bg-fill-quiet text-ink-secondary">
            <Icon name={c.icon} size={16} />
          </span>
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
