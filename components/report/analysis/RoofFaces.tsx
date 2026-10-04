import { useId } from 'react';
import type { BuildingResponse, ScenarioResult } from '@/src/types/app';
import { Icon } from '@/components/common/Icon';
import { compass, kwh } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TUNING } from '@/src/config/bc';
import { roofFaces, type RoofFace } from './derive';

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The roof as Google sees it: a compass showing which way each face points (wedge length = its area,
 * sky when this size puts panels on it; the south-ish arc is BC's best facing), the sunniest spot and
 * roof area, then one row per face: direction, pitch, a cloud when it's partly shaded, panels used.
 */
export function RoofFaces({
  building,
  scenario,
}: {
  building: Pick<BuildingResponse, 'segments' | 'configs' | 'panels' | 'roof'>;
  scenario: Pick<ScenarioResult, 'configIndex' | 'acKwhYear1'> | null;
}) {
  const id = useId();
  const faces = roofFaces(building, scenario);
  const shown = faces.slice(0, 6);
  const { roof } = building;

  return (
    <section aria-labelledby={id} className="grid content-start gap-3 print:break-inside-avoid">
      <h2 id={id} className="text-headline">
        Your roof
      </h2>

      <div className="flex items-center gap-4">
        <Compass faces={faces} />
        <dl className="grid flex-1 gap-2 text-callout">
          <div className="flex flex-col-reverse">
            <dt className="text-ink-secondary">sun-hours a year</dt>
            <dd className="font-rounded text-metric tabular-nums">{kwh(roof.maxSunshineHoursPerYear)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-ink-secondary">m² of roof</dt>
            <dd className="font-rounded text-metric tabular-nums">{kwh(roof.areaMeters2)}</dd>
          </div>
        </dl>
      </div>

      <ul className="rounded-md bg-fill-quiet px-3">
        {shown.map((f) => (
          <FaceRow key={f.index} face={f} />
        ))}
      </ul>
    </section>
  );
}

function FaceRow({ face }: { face: RoofFace }) {
  const shaded = face.shadeSpread > TUNING.shadingSpread;
  const flat = face.pitch < 5;
  return (
    <li className="flex items-center justify-between gap-2 border-separator py-2.5 not-first:border-t">
      <span className="flex items-center gap-2 text-body">
        <span
          aria-hidden="true"
          className={cn('size-2.5 flex-none rounded-full', face.panelsUsed > 0 ? 'bg-sky-600' : 'bg-chart-muted')}
        />
        {flat ? 'Flat' : `${capitalise(compass(face.azimuth))}, ${Math.round(face.pitch)}°`}
        {shaded && <Icon name="cloud" size={14} label="Some shade" className="text-fair-ink" />}
      </span>
      <span className="font-rounded text-callout tabular-nums text-ink">
        {face.panelsMax > 0 ? (
          <>
            {face.panelsUsed}/{face.panelsMax}
            <span className="ml-1 font-sans text-ink-secondary">panels</span>
          </>
        ) : (
          <span className="font-sans text-ink-secondary">No room</span>
        )}
      </span>
    </li>
  );
}


/** Each face as a wedge pointing the way it faces (N up), longer for bigger faces; flat faces as a centre disc. */
function Compass({ faces }: { faces: RoofFace[] }) {
  const R = 46;
  const maxArea = Math.max(...faces.map((f) => f.areaM2), 1);
  const point = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [60 + r * Math.cos(a), 60 + r * Math.sin(a)];
  };
  const wedge = (az: number, r: number) => {
    const [x1, y1] = point(az - 18, r);
    const [x2, y2] = point(az + 18, r);
    return `M60 60 L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;
  };
  const pitched = faces.filter((f) => f.pitch >= 5);
  const flat = faces.filter((f) => f.pitch < 5);
  const flatUsed = flat.some((f) => f.panelsUsed > 0);
  const flatArea = flat.reduce((a, f) => a + f.areaM2, 0);
  // Big faces last, so small ones aren't hidden underneath.
  const ordered = [...pitched].sort((a, b) => a.areaM2 - b.areaM2).reverse();

  return (
    <svg viewBox="0 0 120 120" className="size-[120px] flex-none" role="img" aria-label="Which way each roof face points">
      <circle cx="60" cy="60" r={R + 2} fill="var(--fill-quiet)" />
      <circle cx="60" cy="60" r={R / 2} fill="none" stroke="var(--separator)" />
      {/* South-ish arc (135–225°): BC's best facing. */}
      <path
        d={`M${point(135, R + 2).join(' ')} A${R + 2} ${R + 2} 0 0 1 ${point(225, R + 2).join(' ')}`}
        fill="none"
        stroke="var(--chart-sun)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {ordered.map((f) => (
        <path
          key={f.index}
          d={wedge(f.azimuth, 12 + (R - 12) * Math.sqrt(f.areaM2 / maxArea))}
          fill={f.panelsUsed > 0 ? 'var(--sky-600)' : 'var(--chart-muted)'}
          stroke="var(--surface)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}
      {flat.length > 0 && (
        <circle
          cx="60"
          cy="60"
          r={8 + 10 * Math.sqrt(flatArea / maxArea)}
          fill={flatUsed ? 'var(--sky-600)' : 'var(--chart-muted)'}
          stroke="var(--surface)"
          strokeWidth="2"
        />
      )}
      {(
        [
          ['N', 0],
          ['E', 90],
          ['S', 180],
          ['W', 270],
        ] as const
      ).map(([l, d]) => {
        const [x, y] = point(d, R + 9);
        return (
          <text key={l} x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--ink-tertiary)">
            {l}
          </text>
        );
      })}
    </svg>
  );
}
