// PULSE AI Match Pulse chart. Dependency-free SVG; every value comes from props.
// value: -1..1 momentum (positive = home, negative = away), one point per minute (or finer).
import * as React from 'react';

export type PulseEventKind = 'goal' | 'momentum-shift' | 'attacking-pressure' | 'high-intensity' | 'defensive-recovery' | 'var-check' | 'card-yellow' | 'card-red' | 'substitution';
export interface PulsePoint { minute: number; value: number }
export interface PulseEvent { minute: number; kind: PulseEventKind; label: string; detail?: { label: string; value: string; color?: string }[]; id?: string }

export interface MatchPulseChartProps {
  data: PulsePoint[];
  events?: PulseEvent[];
  /** Current match minute. Area after it is hatched as "not played". */
  minute?: number;
  duration?: number;
  homeLabel?: string;
  awayLabel?: string;
  homeColor?: string;
  awayColor?: string;
  height?: number;
  /** Base URL of the marker SVGs (public/assets/match-pulse/markers). */
  markerBase?: string;
  /** Draw the line progressively on mount (skipped under reduced motion). */
  animate?: boolean;
  /** App extension: notified when a marker is clicked or activated with the keyboard. */
  onEventClick?: (event: PulseEvent) => void;
  /** App extension: id of the selected marker (gets a lime ring). */
  selectedId?: string;
}

function smooth(pts: [number, number][]) {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += `C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

export function MatchPulseChart({ data, events = [], minute, duration = 90, homeLabel = 'HOME', awayLabel = 'AWAY',
  homeColor = 'var(--pulse-chart-momentum-home, #27B8F5)', awayColor = 'var(--pulse-chart-momentum-away, #FF6B3D)',
  height = 300, markerBase = '/assets/match-pulse/markers', animate = true, onEventClick, selectedId }: MatchPulseChartProps) {
  const id = React.useId().replace(/:/g, '');
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(960);
  const [hover, setHover] = React.useState<PulseEvent | null>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 44, padB = 30, padT = 14, padR = 10;
  const cw = w - padL - padR, ch = height - padB - padT, base = padT + ch / 2, amp = ch * 0.44;
  const X = (m: number) => padL + (cw * m) / duration;
  const Y = (v: number) => base - Math.max(-1, Math.min(1, v)) * amp;
  const played = data.filter(p => minute === undefined || p.minute <= minute);
  const pts = played.map(p => [X(p.minute), Y(p.value)] as [number, number]);
  const line = smooth(pts);
  const last = pts[pts.length - 1];
  const area = last ? `${line}L${last[0]} ${base}L${padL} ${base}Z` : '';
  const valueAt = (m: number) => {
    const p = data.reduce((a, b) => (Math.abs(b.minute - m) < Math.abs(a.minute - m) ? b : a), data[0]);
    return p ? p.value : 0;
  };
  const ticks = [0, 15, 30, 45, 60, 75, 90].filter(t => t <= duration);

  return (
    <div ref={ref} className="pulse-match-pulse" style={{ position: 'relative' }}>
      <svg width={w} height={height} role="img" aria-label={`Match Pulse momentum chart, ${homeLabel} versus ${awayLabel}`}>
        <defs>
          <linearGradient id={`${id}-h`} gradientUnits="userSpaceOnUse" x1="0" y1={base - amp} x2="0" y2={base}>
            <stop offset="0" stopColor={homeColor} stopOpacity={0.6} /><stop offset="1" stopColor={homeColor} stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id={`${id}-a`} gradientUnits="userSpaceOnUse" x1="0" y1={base} x2="0" y2={base + amp}>
            <stop offset="0" stopColor={awayColor} stopOpacity={0.03} /><stop offset="1" stopColor={awayColor} stopOpacity={0.6} />
          </linearGradient>
          <clipPath id={`${id}-t`}><rect width={w} height={base} /></clipPath>
          <clipPath id={`${id}-b`}><rect y={base} width={w} height={height} /></clipPath>
          <pattern id={`${id}-f`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1" height="8" fill="#90A3B8" fillOpacity={0.12} />
          </pattern>
        </defs>
        <g className="pulse-chart__grid">
          {ticks.map(t => <line key={t} x1={X(t)} x2={X(t)} y1={padT} y2={padT + ch} />)}
          {[-1, -0.5, 0.5, 1].map(k => <line key={k} x1={padL} x2={padL + cw} y1={Y(k)} y2={Y(k)} />)}
        </g>
        {minute !== undefined && minute < duration && <rect x={X(minute)} y={padT} width={X(duration) - X(minute)} height={ch} fill={`url(#${id}-f)`} />}
        {duration >= 45 && <line x1={X(45)} x2={X(45)} y1={padT} y2={padT + ch} stroke="#90A3B8" strokeOpacity={0.35} strokeDasharray="4 4" />}
        <g className="pulse-chart__axis">
          {ticks.map(t => <text key={t} x={X(t)} y={height - 8} textAnchor="middle">{t === 45 ? 'HT' : `${t}'`}</text>)}
          <text x={padL - 10} y={Y(1) + 4} textAnchor="end">{homeLabel}</text>
          <text x={padL - 10} y={Y(-1) + 4} textAnchor="end">{awayLabel}</text>
        </g>
        <path d={area} fill={`url(#${id}-h)`} clipPath={`url(#${id}-t)`} />
        <path d={area} fill={`url(#${id}-a)`} clipPath={`url(#${id}-b)`} />
        <line className="pulse-chart__baseline" x1={padL} x2={padL + cw} y1={base} y2={base} />
        <path className={`pulse-chart__line${animate ? ' pulse-chart__line--draw' : ''}`} d={line} stroke="var(--pulse-text, #F4F7FB)"
          style={{ ['--_len' as any]: Math.ceil(cw * 2.2) }} />
        {events.map((e, i) => {
          const sz = e.kind === 'goal' ? 32 : 28;
          const cx = X(e.minute), cy = Y(valueAt(e.minute));
          const selected = selectedId !== undefined && e.id === selectedId;
          return (
            <g key={e.id ?? i}>
              {selected && <circle cx={cx} cy={cy} r={sz / 2 + 5} fill="none" stroke="#BCFF47" strokeWidth={2} />}
              <image href={`${markerBase}/${e.kind === 'goal' ? 'goal-event' : e.kind}.svg`} x={cx - sz / 2} y={cy - sz / 2}
                width={sz} height={sz} tabIndex={0} role="button" aria-label={`${e.minute}' ${e.label}`} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(e)} onFocus={() => setHover(e)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                onClick={() => onEventClick?.(e)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onEventClick?.(e); } }} />
            </g>
          );
        })}
        {last && (<g><circle cx={last[0]} cy={last[1]} r={14} fill="#35E0ED" fillOpacity={0.18} /><circle cx={last[0]} cy={last[1]} r={6} fill="#35E0ED" /></g>)}
      </svg>
      {hover && (
        <div className="pulse-tooltip" role="status" style={{ position: 'absolute', left: Math.min(X(hover.minute) + 18, w - 220), top: Math.max(0, Y(valueAt(hover.minute)) - 40), pointerEvents: 'none' }}>
          <div className="pulse-tooltip__time">{hover.minute}' / {hover.kind.replace('-', ' ').toUpperCase()}</div>
          <div className="pulse-tooltip__title">{hover.label}</div>
          {hover.detail?.map(d => (
            <div className="pulse-tooltip__row" key={d.label}><span><i className="pulse-tooltip__swatch" style={{ background: d.color ?? '#35E0ED' }} />{d.label}</span><b>{d.value}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
