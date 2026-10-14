import { useId } from 'react';
import { formatCount } from '../lib/format';
import type { Era, GenreShare } from '../lib/compare';

export function MatchRing({ value, size = 168, stroke = 14, label = 'taste match' }: { value: number; size?: number; stroke?: number; label?: string }) {
  const id = useId();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const small = size < 80;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1ed760" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0.02, value / 100))}
          className="ring-draw"
          style={{ ['--ring-length' as string]: circumference }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display font-bold tabular-nums ${small ? 'text-base' : 'text-5xl'}`}>
          {value}
          <span className={small ? 'text-[10px]' : 'text-2xl text-white/60'}>%</span>
        </span>
        {!small && <span className="mt-1 text-xs uppercase tracking-[0.16em] text-white/50">{label}</span>}
      </div>
    </div>
  );
}

export function VennBar({ onlyA, both, onlyB, aName, bName }: { onlyA: number; both: number; onlyB: number; aName: string; bName: string }) {
  const total = onlyA + both + onlyB || 1;
  const segments = [
    { value: onlyA, className: 'bg-mint/80', label: `Only ${aName}` },
    { value: both, className: 'bg-white', label: 'Both' },
    { value: onlyB, className: 'bg-violet/80', label: `Only ${bName}` },
  ];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5">
        {segments.map((segment) =>
          segment.value ? <div key={segment.label} className={`${segment.className} h-full`} style={{ width: `${(segment.value / total) * 100}%`, minWidth: 4 }} /> : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {segments.map((segment, index) => (
          <div key={segment.label} className={index === 1 ? 'text-center' : index === 2 ? 'text-right' : ''}>
            <p className="font-display text-lg font-semibold tabular-nums">{formatCount(segment.value)}</p>
            <p className="truncate text-white/50">{segment.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function decadeLabel(decade: number) {
  return decade < 2000 ? `${String(decade).slice(2)}s` : `${decade}s`;
}

export function EraChart({ eras, aName, bName }: { eras: Era[]; aName: string; bName: string }) {
  const max = Math.max(...eras.flatMap((era) => [era.a, era.b]), 0.01);
  return (
    <div>
      <div className="flex h-40 items-end gap-2 sm:gap-3">
        {eras.map((era) => (
          <div key={era.decade} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-[3px]">
              <div className="w-1/2 max-w-[18px] rounded-t-md bg-mint" style={{ height: `${(era.a / max) * 100}%`, minHeight: era.a ? 3 : 0 }} title={`${aName}: ${Math.round(era.a * 100)}%`} />
              <div className="w-1/2 max-w-[18px] rounded-t-md bg-violet" style={{ height: `${(era.b / max) * 100}%`, minHeight: era.b ? 3 : 0 }} title={`${bName}: ${Math.round(era.b * 100)}%`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 border-t border-line pt-2 sm:gap-3">
        {eras.map((era) => (
          <span key={era.decade} className="min-w-0 flex-1 truncate text-center text-[11px] text-white/50">
            {decadeLabel(era.decade)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GenreBars({ genres, aName, bName }: { genres: GenreShare[]; aName: string; bName: string }) {
  const max = Math.max(...genres.flatMap((g) => [g.a, g.b]), 0.01);
  return (
    <ul className="space-y-3">
      {genres.map((genre) => (
        <li key={genre.genre} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm">
          <span className="truncate capitalize text-white/80">{genre.genre}</span>
          <span className="space-y-1">
            <span className="block h-1.5 rounded-full bg-mint" style={{ width: `${(genre.a / max) * 100}%` }} title={`${aName}: ${Math.round(genre.a * 100)}%`} />
            <span className="block h-1.5 rounded-full bg-violet" style={{ width: `${(genre.b / max) * 100}%` }} title={`${bName}: ${Math.round(genre.b * 100)}%`} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Legend({ aName, bName }: { aName: string; bName: string }) {
  return (
    <div className="flex items-center gap-4 text-xs text-white/55">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-mint" />
        {aName}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-violet" />
        {bName}
      </span>
    </div>
  );
}
