import { describe, expect, it } from 'vitest';
import { EMPTY_DIRECTOR, STALE_AFTER, autoCues, directorReducer, scoreAt, type Cue } from '../features/broadcast/director';
import type { MatchEvent, MomentumInsight } from '../types/api';

const ev = (id: string, t: number, type: MatchEvent['type'], extra: Partial<MatchEvent> = {}): MatchEvent => ({
  id, seq: Number(id.slice(1)), t, minute: Math.floor(t / 60), second: t % 60, period: t < 2700 ? 1 : 2, type, team: 'north-city', player_id: 'NCF09', player_name: 'Kai Lindqvist',
  related_player_id: null, related_player_name: null, outcome: null, x: 90, y: 34, end_x: null, end_y: null, pitch_x: 90, pitch_y: 34, pitch_end_x: null, pitch_end_y: null,
  xg: null, progressive: false, final_third_entry: false, box_entry: false, key_pass: false, sequence_id: 1, score_home: 0, score_away: 0, description: '', ...extra,
});
const ins = (id: string, kind: MomentumInsight['kind'], end: number, importance: number): MomentumInsight => ({
  id, kind, minute: Math.floor(end / 60), t: end - 60, window_start_t: end - 300, window_end_t: end, team: 'north-city', importance, headline: id, explanation: '',
  stats: {}, event_ids: [], evidence: [], ai_explanation: null, ai_explanation_source: null, verification_status: null, marker_kind: 'momentum-shift',
});
const cue = (id: string, extra: Partial<Cue> = {}): Cue => ({ id, kind: 'insight', at: 0, high: false, ms: 5000, auto: true, label: id, ...extra });

const events = [ev('E1', 0, 'kickoff'), ev('E2', 1000, 'goal', { score_home: 1 }), ev('E3', 2700, 'halftime', { score_home: 1 }), ev('E4', 3000, 'goal', { score_home: 1, score_away: 1, team: 'south-united' }), ev('E5', 5400, 'fulltime', { score_home: 1, score_away: 1 })];
const insights = [ins('swing', 'momentum-swing', 1500, 0.96), ins('minor', 'defensive-stand', 1600, 0.6), ins('surge', 'attacking-surge', 1700, 0.95), ins('build', 'goal-buildup', 1000, 1)];

describe('broadcast auto director', () => {
  it('raises a goal followed by the scorer card, major moments only, and title cards at HT and FT', () => {
    const goal = autoCues(990, 1001, events, insights);
    expect(goal.map(g => g.map(c => c.kind))).toEqual([['goal', 'player']]);
    expect(goal[0][0].high).toBe(true);

    const mid = autoCues(1400, 1800, events, insights);
    expect(mid.flat().map(c => c.kind)).toEqual([]); // a 400 s jump is a seek: only the last 15 s count

    const played = [...autoCues(1490, 1600, events, insights), ...autoCues(1600, 1710, events, insights)].flat();
    expect(played.map(c => [c.kind, c.label])).toEqual([['momentum', 'swing'], ['insight', 'surge']]); // 0.6 importance and goal build-ups are skipped

    expect(autoCues(2690, 2705, events, insights).flat().map(c => c.kind)).toEqual(['halftime']);
    const ft = autoCues(5390, 5400, events, insights).flat();
    expect(ft.map(c => c.kind)).toEqual(['fulltime']);
    expect(ft[0].ms).toBeNull();
    expect(autoCues(1000, 900, events, insights)).toEqual([]);
  });

  it('lets a seek onto a goal still trigger it', () => {
    expect(autoCues(0, 1003, events, insights).flat().map(c => c.kind)).toEqual(['goal', 'player']);
  });

  it('queues cues, lets goals jump ahead and replace routine graphics, and drops stale ones', () => {
    let s = directorReducer(EMPTY_DIRECTOR, { type: 'enqueue', cues: [cue('a', { at: 100 })] });
    expect(s.current?.id).toBe('a');
    s = directorReducer(s, { type: 'enqueue', cues: [cue('b', { at: 120 })] });
    expect(s.queue.map(c => c.id)).toEqual(['b']);
    s = directorReducer(s, { type: 'enqueue', cues: [cue('g', { kind: 'goal', high: true, at: 130 }), cue('p', { kind: 'player', at: 130 })] });
    expect(s.current?.id).toBe('g'); // routine graphic replaced
    expect(s.queue.map(c => c.id)).toEqual(['p', 'b']); // scorer card follows the goal
    s = directorReducer(s, { type: 'next', t: 140 });
    expect(s.current?.id).toBe('p');
    s = directorReducer(s, { type: 'next', t: 120 + STALE_AFTER + 1 });
    expect(s.current).toBeNull(); // 'b' was too old to air
    expect(s.log.map(c => c.id)).toEqual(['a', 'g', 'p']);
  });

  it('drops a queued scorer card once a newer goal arrives', () => {
    let s = directorReducer(EMPTY_DIRECTOR, { type: 'enqueue', cues: [cue('g1', { kind: 'goal', high: true, at: 100 }), cue('p1', { kind: 'player', at: 100 })] });
    s = directorReducer(s, { type: 'enqueue', cues: [cue('g2', { kind: 'goal', high: true, at: 400 }), cue('p2', { kind: 'player', at: 400 })] });
    expect(s.current?.id).toBe('g1');
    expect(s.queue.map(c => c.id)).toEqual(['g2', 'p2']);
  });

  it('does not air the same cue twice and manual takes clear the queue', () => {
    let s = directorReducer(EMPTY_DIRECTOR, { type: 'enqueue', cues: [cue('a')] });
    s = directorReducer(s, { type: 'enqueue', cues: [cue('a')] });
    expect(s.queue).toHaveLength(0);
    s = directorReducer(s, { type: 'enqueue', cues: [cue('b')] });
    s = directorReducer(s, { type: 'take', cue: cue('m', { auto: false, ms: null }) });
    expect(s.current?.id).toBe('m');
    expect(s.queue).toHaveLength(0);
    s = directorReducer(s, { type: 'clear' });
    expect(s.current).toBeNull();
    expect(directorReducer(s, { type: 'reset' })).toEqual(EMPTY_DIRECTOR);
  });

  it('reads the score at any match time', () => {
    expect(scoreAt(events, 999)).toEqual([0, 0]);
    expect(scoreAt(events, 2700)).toEqual([1, 0]);
    expect(scoreAt(events, 5400)).toEqual([1, 1]);
  });
});

describe('broadcast stand-in feed', () => {
  it('projects pitch metres with the camera used by the CSS pitch', async () => {
    const { project, panFor, pickTrail, possessionEvent } = await import('../features/broadcast/feed');
    const centre = project(52.5, 34, 0);
    expect(centre.x).toBeCloseTo(960, 5);
    const far = project(52.5, 0, 0), near = project(52.5, 68, 0);
    expect(far.y).toBeLessThan(centre.y);
    expect(near.y).toBeGreaterThan(centre.y);
    expect(far.s).toBeLessThan(near.s); // farther away looks smaller
    expect(project(52.5, 34, 120).x).toBeCloseTo(1080, 5);
    expect(panFor(52.5)).toBe(0);
    expect(panFor(100)).toBeLessThan(0); // ball on the right: the camera pans right

    const evs = [ev('E1', 100, 'pass'), ev('E2', 130, 'carry'), ev('E3', 140, 'foul', { team: 'south-united' }), ev('E4', 150, 'substitution')];
    expect(pickTrail(evs, 150).map(e => e.id)).toEqual(['E2', 'E3']); // E1 is older than the trail window, substitutions have no ball
    expect(possessionEvent(evs)?.id).toBe('E2'); // a foul does not give the fouling side the ball
  });
});
