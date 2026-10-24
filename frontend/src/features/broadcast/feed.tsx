// Stand-in feed for the Broadcast view: the kit pitch under a perspective "camera", with a
// telestrator layer drawn from the real event stream (passes, carries, shots, ball wins, shirt
// numbers, the ball). Clearly labelled as a stand-in for match footage.
//
// The pitch image is tilted with a CSS 3D transform. The telestrator is NOT drawn inside that
// transform (Chrome rasterises 3D layers soft, so numbers blur); instead every pitch point is
// projected here with the same maths and drawn in flat, crisp stage coordinates.
import * as React from 'react';
import { TEAMS } from '../../pulse';
import type { MatchEvent, TeamId } from '../../types/api';

const A = '/assets';

/** Match seconds an action stays on the pitch before it fades out. */
export const TRAIL_SECONDS = 24;
const TRAIL_MAX = 9;
const TRAIL_TYPES = new Set<MatchEvent['type']>(['pass', 'carry', 'shot', 'goal', 'recovery', 'interception', 'tackle', 'foul', 'corner']);
const LIME = '#BCFF47';
const MISS = '#B7C5D4';

type XY = [number, number];

/* Camera. Keep in sync with .bc-feed__cam in app.css (width 2400px, bottom -60px,
   perspective(1000px) rotateX(24deg), origin at the centre of the near edge). */
const CAM_W = 2400;
const PX_PER_M = CAM_W / 113; // field.svg viewBox is -4..109 x -4..72 metres
const CAM_H = 76 * PX_PER_M;
const ORIGIN: XY = [960, 1080 + 60];
const TILT = (24 * Math.PI) / 180;
const PERSPECTIVE = 1000;

/** Pitch metres (display frame) to stage pixels, plus the depth scale at that point. */
export function project(mx: number, my: number, pan: number): { x: number; y: number; s: number } {
  const X = (mx + 4) * PX_PER_M - CAM_W / 2;
  const Y = (my + 4) * PX_PER_M - CAM_H;
  const w = 1 - (Y * Math.sin(TILT)) / PERSPECTIVE;
  return { x: ORIGIN[0] + X / w + pan, y: ORIGIN[1] + (Y * Math.cos(TILT)) / w, s: 1 / w };
}

/** Camera pan (stage px) that keeps the ball in view. */
export const panFor = (ballX: number) => Math.round((52.5 - ballX) * PX_PER_M * 0.45);

/** Eases a number towards its target with requestAnimationFrame. */
function useEased(target: number, ms = 1200): number {
  const [value, setValue] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const k = 1 - Math.exp(-(now - last) / (ms / 4));
      last = now;
      current.current += (target - current.current) * k;
      if (Math.abs(target - current.current) < 0.05) { current.current = target; setValue(target); return; }
      setValue(current.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** The events drawn on the pitch: the latest actions with coordinates, newest last. */
export function pickTrail(visible: MatchEvent[], t: number): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (let i = visible.length - 1; i >= 0 && out.length < TRAIL_MAX; i--) {
    const e = visible[i];
    if (t - e.t > TRAIL_SECONDS) break;
    if (e.pitch_x !== null && e.pitch_y !== null && TRAIL_TYPES.has(e.type)) out.unshift(e);
  }
  return out;
}

/** Display-frame goal the acting team attacks: the home side attacks towards x = 105. */
const goalOf = (team: TeamId | null, home: TeamId): XY => [team === home ? 105 : 0, 34];

function endOf(e: MatchEvent, home: TeamId): XY | null {
  if ((e.type === 'pass' || e.type === 'carry') && e.pitch_end_x !== null && e.pitch_end_y !== null) return [e.pitch_end_x, e.pitch_end_y];
  if (e.type === 'shot' || e.type === 'goal') {
    const [gx, gy] = goalOf(e.team, home);
    // aim at the goal mouth, slightly towards the side the shot came from
    return [gx, gy + Math.max(-3, Math.min(3, ((e.pitch_y ?? 34) - 34) * 0.12))];
  }
  return null;
}

/** Where the ball is after an event. */
export function ballAfter(e: MatchEvent, home: TeamId): XY {
  return endOf(e, home) ?? [e.pitch_x ?? 52.5, e.pitch_y ?? 34];
}

type Proj = (m: XY) => { x: number; y: number; s: number };

/** Shorten a screen-space segment so an arrowhead stops at the edge of a dot. */
function trim(a: { x: number; y: number }, b: { x: number; y: number }, by: number): { x: number; y: number } {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  if (len <= by * 1.5) return b;
  return { x: b.x - (dx / len) * by, y: b.y - (dy / len) * by };
}

const dotRadius = (big: boolean, s: number) => (big ? 30 : 15) * s + 4;

function PlayerDot({ p, team, number, big, opacity }: { p: { x: number; y: number; s: number }; team: TeamId; number?: number; big: boolean; opacity: number }) {
  const c = TEAMS[team].color;
  const r = dotRadius(big, p.s);
  return (
    <g opacity={opacity}>
      {big && <circle cx={p.x} cy={p.y} r={r + 9 * p.s + 2} fill="none" stroke={c} strokeWidth={2.5} opacity={0.65} />}
      <circle cx={p.x} cy={p.y} r={r} fill={c} stroke="#F4F7FB" strokeWidth={big ? 3 : 2} />
      {big && number !== undefined && (
        <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={r * 1.05} fontWeight={700}
          style={{ fontFamily: 'var(--pulse-font-display)' }} fill={team === 'north-city' ? '#07111F' : '#F4F7FB'}>{number}</text>
      )}
    </g>
  );
}

function Label({ p, text, color, dy }: { p: { x: number; y: number; s: number }; text: string; color: string; dy: number }) {
  return (
    <text x={p.x} y={p.y - dy} textAnchor="middle" fontSize={Math.max(18, 26 * p.s)} fontWeight={700} fill={color}
      stroke="#07111F" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke" style={{ fontFamily: 'var(--pulse-font-mono)', letterSpacing: '0.08em' }}>{text}</text>
  );
}

function Mark({ e, home, latest, opacity, numbers, id, P }: { e: MatchEvent; home: TeamId; latest: boolean; opacity: number; numbers: Record<string, number>; id: string; P: Proj }) {
  const team = e.team ?? home;
  const c = TEAMS[team].color;
  const a = P([e.pitch_x!, e.pitch_y!]);
  const endM = endOf(e, home);
  const num = e.player_id ? numbers[e.player_id] : undefined;
  const actor = <PlayerDot p={a} team={team} number={num} big={latest} opacity={latest ? 1 : opacity} />;
  const width = (latest ? 6 : 4) * a.s + 1.5;

  if ((e.type === 'pass' || e.type === 'carry') && endM) {
    const ok = e.outcome !== 'incomplete';
    const b = P(endM);
    const color = ok ? c : MISS;
    const showReceiver = latest && e.type === 'pass' && ok;
    const tip = trim(a, b, showReceiver ? dotRadius(true, b.s) + 6 : 6);
    const receiver = showReceiver && e.related_player_id ? numbers[e.related_player_id] : undefined;
    const x = 12 * b.s + 4;
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={tip.x} y2={tip.y} stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round"
          strokeDasharray={e.type === 'carry' ? `1 ${width * 2.2}` : ok ? undefined : `${width * 3} ${width * 2}`}
          markerEnd={`url(#${id}-${ok ? team : 'miss'})`} />
        {!ok && latest && <path d={`M${b.x - x} ${b.y - x}L${b.x + x} ${b.y + x}M${b.x + x} ${b.y - x}L${b.x - x} ${b.y + x}`} stroke={MISS} strokeWidth={4} strokeLinecap="round" />}
        {showReceiver && <PlayerDot p={b} team={team} number={receiver} big opacity={1} />}
        {actor}
      </g>
    );
  }
  if ((e.type === 'shot' || e.type === 'goal') && endM) {
    const b = P(endM);
    return (
      <g>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={LIME} strokeOpacity={opacity} strokeWidth={width + 1.5} strokeLinecap="round" markerEnd={`url(#${id}-shot)`} />
        {actor}
        {latest && e.xg !== null && <Label p={a} text={`${e.type === 'goal' ? 'GOAL' : 'SHOT'}  xG ${e.xg.toFixed(2)}`} color={LIME} dy={dotRadius(true, a.s) + 16} />}
      </g>
    );
  }
  if (e.type === 'recovery' || e.type === 'interception' || e.type === 'tackle') {
    const r = dotRadius(true, a.s) + (latest ? 18 : 10) * a.s;
    return (
      <g opacity={latest ? 1 : opacity}>
        <circle cx={a.x} cy={a.y} r={r} fill="none" stroke={c} strokeWidth={3} strokeDasharray="8 6" />
        {actor}
        {latest && <Label p={a} text="BALL WON" color={c} dy={r + 12} />}
      </g>
    );
  }
  return actor;
}

export function StandInFeed({ trail, ball, home, numbers }: { trail: MatchEvent[]; ball: XY | null; home: TeamId; numbers: Record<string, number> }) {
  const id = React.useId().replace(/:/g, '');
  const bx = useEased(ball?.[0] ?? 52.5, 500);
  const by = useEased(ball?.[1] ?? 34, 500);
  const pan = useEased(panFor(ball?.[0] ?? 52.5), 1600);
  const P: Proj = ([mx, my]) => project(mx, my, pan);
  const t = trail.length ? trail[trail.length - 1].t : 0;
  const teams: TeamId[] = ['north-city', 'south-united'];
  const bp = P([bx, by]);
  const arrow = (key: string, fill: string) => (
    <marker key={key} id={`${id}-${key}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill={fill} />
    </marker>
  );
  return (
    <div className="bc-feed" aria-hidden>
      <div className="bc-feed__sky" />
      <div className="bc-feed__stands" />
      <div className="bc-feed__cam" style={{ ['--pan' as string]: `${pan.toFixed(1)}px` }}>
        <img src={`${A}/pitch/field.svg`} alt="" />
      </div>
      <div className="bc-feed__lights" />
      <div className="bc-feed__vignette" />
      <svg className="bc-feed__marks" viewBox="0 0 1920 1080">
        <defs>
          {teams.map(tm => arrow(tm, TEAMS[tm].color))}
          {arrow('miss', MISS)}
          {arrow('shot', LIME)}
          <radialGradient id={`${id}-glow`}><stop offset="0" stopColor="#F4F7FB" stopOpacity={0.6} /><stop offset="1" stopColor="#F4F7FB" stopOpacity={0} /></radialGradient>
        </defs>
        {trail.map((e, i) => {
          const latest = i === trail.length - 1;
          const opacity = latest ? 1 : Math.max(0.2, 0.85 - (t - e.t) / TRAIL_SECONDS);
          return <Mark key={e.id} e={e} home={home} latest={latest} opacity={opacity} numbers={numbers} id={id} P={P} />;
        })}
        {/* the ball sits at the player's feet, just in front of the dot, so the shirt number stays readable */}
        {ball && (
          <g transform={`translate(${bp.x.toFixed(1)} ${(bp.y + dotRadius(true, bp.s) + 4).toFixed(1)})`}>
            <circle r={22 * bp.s} fill={`url(#${id}-glow)`} />
            <circle r={9 * bp.s + 2} fill="#F4F7FB" stroke="#07111F" strokeWidth={2} />
          </g>
        )}
      </svg>
      <div className="bc-feed__tag">STAND-IN FEED  /  SYNTHETIC MATCH DATA</div>
    </div>
  );
}

const POSSESSION_TYPES = new Set<MatchEvent['type']>(['pass', 'carry', 'shot', 'goal', 'recovery', 'interception', 'tackle', 'corner']);

/** Latest event that tells us who has the ball. */
export function possessionEvent(visible: MatchEvent[]): MatchEvent | null {
  for (let i = visible.length - 1; i >= 0; i--) if (visible[i].team && POSSESSION_TYPES.has(visible[i].type)) return visible[i];
  return null;
}

const surname = (name: string | null) => (name ?? '').split(' ').slice(-1)[0];

function describe(e: MatchEvent): string {
  const who = surname(e.player_name), to = surname(e.related_player_name);
  switch (e.type) {
    case 'pass': return e.outcome === 'incomplete' ? `Pass from ${who} goes astray` : `${e.key_pass ? 'Key pass' : e.progressive ? 'Forward pass' : 'Pass'}: ${who} to ${to}`;
    case 'carry': return `${who} carries the ball${e.box_entry ? ' into the box' : e.progressive ? ' forward' : ''}`;
    case 'shot': return `Shot: ${who}, xG ${e.xg?.toFixed(2) ?? '?'}${e.outcome === 'on_target' ? ', saved' : e.outcome === 'blocked' ? ', blocked' : e.outcome === 'off_target' ? ', off target' : ''}`;
    case 'goal': return `GOAL: ${who}`;
    case 'recovery': return `Ball won: ${who}`;
    case 'interception': return `Interception: ${who}`;
    case 'tackle': return `Tackle: ${who}`;
    case 'foul': return `Foul by ${who}`;
    case 'corner': return 'Corner kick';
    case 'card': return `Yellow card: ${who}`;
    case 'substitution': return `${who} on for ${to}`;
    default: return e.description;
  }
}

/** Updates at most every `ms` so the caption stays readable at high replay speeds. */
function useSteady<T>(value: T, ms: number): T {
  const [shown, setShown] = React.useState(value);
  const last = React.useRef(0);
  React.useEffect(() => {
    const wait = Math.max(0, last.current + ms - performance.now());
    const h = window.setTimeout(() => { last.current = performance.now(); setShown(value); }, wait);
    return () => window.clearTimeout(h);
  }, [value, ms]);
  return shown;
}

const NOTABLE = (e: MatchEvent) => ['shot', 'goal', 'recovery', 'interception', 'tackle', 'foul', 'card', 'corner', 'substitution'].includes(e.type)
  || (e.type === 'pass' && e.key_pass) || (e.type === 'carry' && e.box_entry);

/**
 * The action described in the caption. Up to 10x every action is readable, so it is the same
 * action the pitch highlights. Faster than that, the caption follows notable actions only
 * (shots, ball wins, key passes, fouls) so the text does not flicker.
 */
export function captionEvent(visible: MatchEvent[], t: number, speed: number): MatchEvent | null {
  if (speed <= 10) return possessionEvent(visible);
  for (let i = visible.length - 1; i >= 0 && t - visible[i].t <= 45; i--) if (visible[i].team && NOTABLE(visible[i])) return visible[i];
  return possessionEvent(visible);
}

/** Possession caption under the score bug: who has the ball, which way they attack, the latest action. */
export function PossessionChip({ possession, caption, home, speed }: { possession: MatchEvent | null; caption: MatchEvent | null; home: TeamId; speed: number }) {
  const action = useSteady(caption, speed <= 10 ? 0 : 1200);
  if (!possession || !possession.team) return null;
  const t = TEAMS[possession.team];
  const zone = possession.x === null ? '' : possession.x >= 70 ? 'Final third' : possession.x >= 35 ? 'Middle third' : 'Own third';
  const right = possession.team === home;
  return (
    <div className="pb-safe">
      <div className="bc-poss pb-plate" style={{ ['--_team' as string]: t.color }}>
        <img src={t.badgeSmall} alt="" />
        <div>
          <div className="bc-poss__head">
            <span>{t.short} in possession</span>
            <svg viewBox="0 0 40 14" className="bc-poss__dir" style={{ transform: right ? undefined : 'scaleX(-1)' }} aria-label={right ? 'attacking right' : 'attacking left'}>
              <path d="M1 7H33M27 1.5L35 7L27 12.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {zone && <em>{zone}</em>}
          </div>
          {action && <div className="bc-poss__act">{describe(action)}</div>}
        </div>
      </div>
    </div>
  );
}
