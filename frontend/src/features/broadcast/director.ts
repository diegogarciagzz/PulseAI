// Broadcast director: a small cue queue that decides which graphic is on air.
// Pure functions only, so the rules are unit-tested without rendering anything.
import type { PunditId } from '../../pulse';
import type { MatchEvent, MomentumInsight } from '../../types/api';
import { FULL_T, HALF_T } from '../../hooks/useReplay';

export type CueKind = 'goal' | 'player' | 'momentum' | 'insight' | 'ai-insight' | 'var' | 'pundit' | 'potm' | 'halftime' | 'fulltime';

export interface Cue {
  id: string;
  kind: CueKind;
  /** Match time (seconds) the graphic refers to. */
  at: number;
  /** Goals and title cards jump the queue and replace a lower-priority graphic. */
  high: boolean;
  /** Time on air in ms. null keeps it on air until it is replaced or cleared. */
  ms: number | null;
  auto: boolean;
  label: string;
  event?: MatchEvent;
  insight?: MomentumInsight;
  claim?: string;
  pundit?: PunditId;
  playerId?: string;
  playerName?: string;
}

export interface DirectorState { current: Cue | null; queue: Cue[]; log: Cue[] }

export type DirectorAction =
  | { type: 'enqueue'; cues: Cue[] }
  | { type: 'take'; cue: Cue }
  | { type: 'next'; t: number }
  | { type: 'clear' }
  | { type: 'reset' };

export const EMPTY_DIRECTOR: DirectorState = { current: null, queue: [], log: [] };

/** Auto cues older than this (match seconds) are dropped rather than aired late. */
export const STALE_AFTER = 8 * 60;
export const MAX_QUEUE = 4;
const LOG_SIZE = 14;

/** Insight kinds shown as a momentum toast; the rest use the AI insight lower-third. */
export const MOMENTUM_KINDS = new Set<MomentumInsight['kind']>(['momentum-swing', 'pressure-surge', 'substitution-impact']);
/** Minimum importance for the auto director to put a detected moment on air. */
export const AUTO_MIN_IMPORTANCE = 0.9;

const ON_AIR_MS = { goal: 6500, player: 6500, momentum: 6500, insight: 8000, halftime: 7000 } as const;

function air(log: Cue[], cue: Cue | null): Cue[] {
  return cue ? [...log, cue].slice(-LOG_SIZE) : log;
}

export function directorReducer(s: DirectorState, a: DirectorAction): DirectorState {
  switch (a.type) {
    case 'enqueue': {
      if (!a.cues.length) return s;
      const high = a.cues[0].high;
      let queue = s.queue.filter(q => !a.cues.some(c => c.id === q.id));
      if (s.current && a.cues.some(c => c.id === s.current!.id)) return s;
      if (high) {
        // a newer goal or title card makes queued auto player cards from earlier moments obsolete
        queue = queue.filter(q => !(q.auto && q.kind === 'player' && q.at < a.cues[0].at));
        const lastHigh = queue.reduce((idx, q, k) => (q.high ? k : idx), -1);
        queue = [...queue.slice(0, lastHigh + 1), ...a.cues, ...queue.slice(lastHigh + 1)];
      } else {
        queue = [...queue, ...a.cues];
      }
      queue = queue.slice(0, MAX_QUEUE);
      let current = s.current;
      if (current && !current.high && high) current = null; // a goal or title card replaces a routine graphic
      if (current) return { ...s, queue };
      const [next, ...rest] = queue;
      return { current: next ?? null, queue: rest, log: air(s.log, next ?? null) };
    }
    case 'take':
      return { current: a.cue, queue: [], log: air(s.log, a.cue) };
    case 'next': {
      const fresh = s.queue.filter(c => c.high || !c.auto || a.t - c.at <= STALE_AFTER);
      const [next, ...rest] = fresh;
      return { current: next ?? null, queue: rest, log: air(s.log, next ?? null) };
    }
    case 'clear':
      return { ...s, current: null, queue: [] };
    case 'reset':
      return EMPTY_DIRECTOR;
  }
}

/**
 * Cues the auto director raises when the replay clock moves from `prev` to `t`.
 * A long jump (seek) only picks up what happened in the last few seconds, so
 * skipping ahead never floods the screen with old graphics.
 */
export function autoCues(prev: number, t: number, events: MatchEvent[], insights: MomentumInsight[]): Cue[][] {
  if (t <= prev) return [];
  const from = t - prev > 120 ? t - 15 : prev;
  const inWindow = (x: number) => x > from && x <= t;
  const groups: { at: number; cues: Cue[] }[] = [];

  for (const e of events) {
    if (e.type !== 'goal' || !inWindow(e.t)) continue;
    const name = e.player_name ?? 'Goal';
    groups.push({
      at: e.t, cues: [
        { id: `auto-goal-${e.id}`, kind: 'goal', at: e.t, high: true, ms: ON_AIR_MS.goal, auto: true, label: `Goal: ${name}`, event: e },
        { id: `auto-player-${e.id}`, kind: 'player', at: e.t, high: false, ms: ON_AIR_MS.player, auto: true, label: `Player card: ${name}`, playerId: e.player_id ?? undefined, playerName: name },
      ],
    });
  }
  for (const i of insights) {
    if (i.kind === 'goal-buildup' || i.importance < AUTO_MIN_IMPORTANCE || !inWindow(i.window_end_t)) continue;
    const momentum = MOMENTUM_KINDS.has(i.kind);
    groups.push({
      at: i.window_end_t, cues: [{
        id: `auto-ins-${i.id}`, kind: momentum ? 'momentum' : 'insight', at: i.window_end_t, high: false,
        ms: momentum ? ON_AIR_MS.momentum : ON_AIR_MS.insight, auto: true, label: i.headline, insight: i,
      }],
    });
  }
  if (inWindow(HALF_T)) {
    groups.push({ at: HALF_T, cues: [{ id: 'auto-halftime', kind: 'halftime', at: HALF_T, high: true, ms: ON_AIR_MS.halftime, auto: true, label: 'Half-time analysis' }] });
  }
  if (inWindow(FULL_T)) {
    groups.push({ at: FULL_T, cues: [{ id: 'auto-fulltime', kind: 'fulltime', at: FULL_T, high: true, ms: null, auto: true, label: 'Full-time recap' }] });
  }
  return groups.sort((a, b) => a.at - b.at).map(g => g.cues);
}

export function scoreAt(events: MatchEvent[], t: number): [number, number] {
  let s: [number, number] = [0, 0];
  for (const e of events) { if (e.t > t) break; s = [e.score_home, e.score_away]; }
  return s;
}
