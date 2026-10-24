import type { TeamStats } from '../types/api';

const ROWS: { key: keyof TeamStats; label: string; pct?: boolean; fixed?: number }[] = [
  { key: 'possession_pct', label: 'Possession', pct: true },
  { key: 'shots', label: 'Shots' },
  { key: 'shots_on_target', label: 'On target' },
  { key: 'xg', label: 'xG', fixed: 2 },
  { key: 'final_third_entries', label: 'Final-third entries' },
  { key: 'box_entries', label: 'Box entries' },
  { key: 'progressive_passes', label: 'Progressive passes' },
  { key: 'pass_accuracy', label: 'Pass accuracy', pct: true },
  { key: 'recoveries', label: 'Recoveries' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Interceptions' },
  { key: 'corners', label: 'Corners' },
  { key: 'fouls', label: 'Fouls' },
];

function fmt(v: number, r: (typeof ROWS)[number]): string {
  if (r.pct) return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
  if (r.fixed !== undefined) return v.toFixed(r.fixed);
  return String(v);
}

export function StatsPanel({ home, away, rows = ROWS }: { home: TeamStats; away: TeamStats; rows?: typeof ROWS }) {
  return (
    <div>
      {rows.map(r => {
        const h = home[r.key] as number, a = away[r.key] as number;
        const total = h + a || 1;
        const hp = r.pct ? h : (h / total) * 100, ap = r.pct ? a : (a / total) * 100;
        return (
          <div className="statrow" key={r.key}>
            <b>{fmt(h, r)}</b>
            <div className="statrow__mid">
              <span className="statrow__label">{r.label}</span>
              <div className="bar2"><i style={{ width: `${hp}%` }} /><i style={{ width: `${ap}%` }} /></div>
            </div>
            <b>{fmt(a, r)}</b>
          </div>
        );
      })}
    </div>
  );
}

export const COMPACT_ROWS = ROWS.slice(0, 7);
