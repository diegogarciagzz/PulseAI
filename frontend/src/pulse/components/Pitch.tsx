// PULSE AI tactical pitch + data primitives.
// Coordinates are metres on a 105 x 68 pitch (x: own goal line to opponent goal line,
// y: top touchline to bottom touchline). Plot event data directly, no conversion.
import * as React from 'react';

export const PITCH = { length: 105, width: 68 } as const;
type Orientation = 'horizontal' | 'vertical';

const LINE = 'rgba(183,197,212,0.42)';
const LINE_LIGHT = 'rgba(7,17,31,0.45)';

export interface PitchProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  orientation?: Orientation;
  theme?: 'dark' | 'light';
  /** Show mowing stripes and vignette. Turn off for very small pitches. */
  surface?: boolean;
  /** Crop to the attacking half (x >= 52.5). */
  half?: boolean;
  /** Extra metres around the touchlines. */
  padding?: number;
  children?: React.ReactNode;
  title?: string;
}

/** Inline SVG pitch. Lines use non-scaling strokes so they stay 1.4px at any size. */
export function Pitch({ orientation = 'horizontal', theme = 'dark', surface = true, half = false, padding = 4,
  children, title = 'Football pitch', ...rest }: PitchProps) {
  const id = React.useId().replace(/:/g, '');
  const L = PITCH.length, W = PITCH.width, p = padding;
  const x0 = half ? 52.5 - 1 : -p;
  const vbW = half ? 52.5 + p + 1 : L + 2 * p;
  // half is supported for horizontal pitches; vertical pitches always show the full length
  const vb = orientation === 'horizontal' ? `${x0} ${-p} ${vbW} ${W + 2 * p}` : `${-p} ${-p} ${W + 2 * p} ${L + 2 * p}`;
  const stroke = theme === 'dark' ? LINE : LINE_LIGHT;
  const s = { stroke, strokeWidth: 1.4, vectorEffect: 'non-scaling-stroke' as const, fill: 'none' };
  const stripes = Array.from({ length: 14 }, (_, i) => (
    <rect key={i} x={(i * L) / 14} y={0} width={L / 14} height={W}
      fill={theme === 'dark' ? (i % 2 ? '#0E1E31' : '#0C1A2B') : (i % 2 ? '#E8EEF5' : '#EEF3F8')} />
  ));
  const content = (
    <>
      {surface && (
        <>
          <rect x={-p} y={-p} width={L + 2 * p} height={W + 2 * p} rx={1.2} fill={theme === 'dark' ? '#091524' : '#E3EAF2'} />
          {stripes}
          {theme === 'dark' && <rect x={0} y={0} width={L} height={W} fill={`url(#${id}-v)`} />}
        </>
      )}
      <g {...s}>
        <rect x={0} y={0} width={L} height={W} {...s} />
        <path d="M52.5 0V68" {...s} />
        <circle cx={52.5} cy={34} r={9.15} {...s} />
        <path d="M0 13.84H16.5V54.16H0M105 13.84H88.5V54.16H105" {...s} />
        <path d="M0 24.84H5.5V43.16H0M105 24.84H99.5V43.16H105" {...s} />
        <path d="M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31" {...s} />
        <path d="M0 1A1 1 0 0 0 1 0M104 0A1 1 0 0 0 105 1M105 67A1 1 0 0 0 104 68M1 68A1 1 0 0 0 0 67" {...s} />
        <path d="M0 30.34H-1.8V37.66H0M105 30.34H106.8V37.66H105" {...s} />
      </g>
      <g fill={stroke}><circle cx={52.5} cy={34} r={0.35} /><circle cx={11} cy={34} r={0.3} /><circle cx={94} cy={34} r={0.3} /></g>
      {children}
    </>
  );
  return (
    <svg viewBox={vb} role="img" aria-label={title} {...rest}>
      <defs>
        <radialGradient id={`${id}-v`} cx="50%" cy="50%" r="65%">
          <stop offset="0.55" stopColor="#07111F" stopOpacity="0" /><stop offset="1" stopColor="#07111F" stopOpacity="0.55" />
        </radialGradient>
        <marker id="pulse-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10Z" fill="context-stroke" />
        </marker>
        <pattern id="pulse-hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="0.6" height="1.6" fill="#FF6574" fillOpacity="0.35" />
        </pattern>
        <radialGradient id="pulse-heat">
          <stop offset="0" stopColor="#BCFF47" stopOpacity="0.9" /><stop offset="0.35" stopColor="#35E0ED" stopOpacity="0.6" />
          <stop offset="0.7" stopColor="#1F6FD1" stopOpacity="0.25" /><stop offset="1" stopColor="#0B1F3F" stopOpacity="0" />
        </radialGradient>
      </defs>
      {orientation === 'horizontal' ? content : <g transform={`translate(0 ${L}) rotate(-90)`}>{content}</g>}
    </svg>
  );
}

/* ----------------------------------------------------------------------------
 * Data primitives. All take metres. Colours default to tokens.
 * ------------------------------------------------------------------------- */
type XY = { x: number; y: number };

export function PlayerMarker({ x, y, number, side = 'home', selected, r = 1.9 }: XY & { number?: string | number; side?: 'home' | 'away'; selected?: boolean; r?: number }) {
  const fill = side === 'home' ? 'var(--pulse-team-north-city-primary, #27B8F5)' : 'var(--pulse-team-south-united-primary, #FF5B2E)';
  const ink = side === 'home' ? '#0B1F3F' : '#22262D';
  return (
    <g transform={`translate(${x} ${y})`}>
      {selected && <circle r={r + 1.1} fill="none" stroke="#BCFF47" strokeWidth={0.45} />}
      <circle r={r} fill={fill} stroke="#07111F" strokeWidth={0.35} />
      {number !== undefined && (
        <text y={r * 0.38} textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight={700} fontSize={r * 1.1} fill={ink}>{number}</text>
      )}
    </g>
  );
}

export function PassArrow({ from, to, kind = 'completed', bend = 0.15 }: { from: XY; to: XY; kind?: 'completed' | 'failed' | 'key'; bend?: number }) {
  const mx = (from.x + to.x) / 2 - (to.y - from.y) * bend;
  const my = (from.y + to.y) / 2 + (to.x - from.x) * bend;
  const color = kind === 'key' ? '#BCFF47' : kind === 'failed' ? '#90A3B8' : '#35E0ED';
  return (
    <path d={`M${from.x} ${from.y}Q${mx} ${my} ${to.x} ${to.y}`} fill="none" stroke={color}
      strokeWidth={kind === 'key' ? 0.6 : 0.45} strokeDasharray={kind === 'failed' ? '1.2 1.2' : undefined}
      strokeLinecap="round" markerEnd={kind === 'failed' ? undefined : 'url(#pulse-arrow)'} />
  );
}

export function BallTrajectory({ from, to, height = 8 }: { from: XY; to: XY; height?: number }) {
  const mx = (from.x + to.x) / 2, my = Math.min(from.y, to.y) - height;
  return (
    <g>
      <path d={`M${from.x} ${from.y}Q${mx} ${my} ${to.x} ${to.y}`} fill="none" stroke="#F4F7FB" strokeOpacity={0.85}
        strokeWidth={0.4} strokeDasharray="0.01 1.1" strokeLinecap="round" />
      <circle cx={to.x} cy={to.y} r={0.9} fill="#F4F7FB" />
    </g>
  );
}

export function ShotMarker({ x, y, xg = 0.1, goal }: XY & { xg?: number; goal?: boolean }) {
  const r = 0.9 + xg * 3.2;
  return goal ? (
    <g><circle cx={x} cy={y} r={r + 1.2} fill="none" stroke="#BCFF47" strokeOpacity={0.45} strokeWidth={0.4} />
      <circle cx={x} cy={y} r={r} fill="#BCFF47" stroke="#07111F" strokeWidth={0.35} /></g>
  ) : <circle cx={x} cy={y} r={r} fill="#35E0ED" fillOpacity={0.2} stroke="#35E0ED" strokeWidth={0.35} />;
}

export function RecoveryMarker({ x, y, size = 2.2 }: XY & { size?: number }) {
  return <path transform={`translate(${x} ${y})`} d={`M0 ${-size}L${size} 0L0 ${size}L${-size} 0Z`} fill="#07111F" stroke="#45D6A0" strokeWidth={0.4} />;
}

export function DangerZone({ x, y, w, h }: XY & { w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1} fill="#FF6574" fillOpacity={0.08} />
      <rect x={x} y={y} width={w} height={h} rx={1} fill="url(#pulse-hatch)" />
      <rect x={x} y={y} width={w} height={h} rx={1} fill="none" stroke="#FF6574" strokeWidth={0.3} strokeDasharray="1.4 1" />
    </g>
  );
}

/** Lightweight heatmap: one blurred kernel per point. For dense data use a canvas layer. */
export function Heatmap({ points, radius = 7 }: { points: (XY & { w?: number })[]; radius?: number }) {
  return (
    <g style={{ mixBlendMode: 'screen' }}>
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={radius * (p.w ?? 1)} fill="url(#pulse-heat)" opacity={0.75} />)}
    </g>
  );
}

export function AttackingDirection({ y = 4, from = 8, to = 30, label = 'ATTACKING' }: { y?: number; from?: number; to?: number; label?: string }) {
  return (
    <g>
      <text x={from} y={y - 1.4} fontFamily="IBM Plex Mono, monospace" fontSize={1.8} fill="#90A3B8" letterSpacing={0.2}>{label}</text>
      <path d={`M${from} ${y}H${to}`} stroke="#35E0ED" strokeWidth={0.55} strokeLinecap="round" markerEnd="url(#pulse-arrow)" />
    </g>
  );
}

/** Pulsing highlight for a selected event location. Respects reduced motion via CSS. */
export function EventHighlight({ x, y }: XY) {
  return (
    <g transform={`translate(${x} ${y})`} className="pulse-event-highlight">
      <style>{`.pulse-event-highlight .ring{transform-box:fill-box;transform-origin:center;animation:peh 1.8s cubic-bezier(.2,0,0,1) infinite}
        @keyframes peh{0%{transform:scale(.3);opacity:.9}100%{transform:scale(1);opacity:0}}
        @media (prefers-reduced-motion: reduce){.pulse-event-highlight .ring{animation:none;opacity:.35}}`}</style>
      <circle className="ring" r={4} fill="none" stroke="#BCFF47" strokeWidth={0.35} />
      <circle r={1.1} fill="#BCFF47" /><circle r={0.45} fill="#07111F" />
    </g>
  );
}
