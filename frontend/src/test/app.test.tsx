import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchPulseChart, PulseLogo, StatusBadge, TEAMS, PUNDITS, PunditCard } from '../pulse';
import { useReplay } from '../hooks/useReplay';
import { StatsPanel } from '../components/StatsPanel';
import type { MatchEvent, MomentumInsight, PulsePoint, TeamStats } from '../types/api';

const ev = (id: string, t: number, type: MatchEvent['type'], extra: Partial<MatchEvent> = {}): MatchEvent => ({
  id, seq: Number(id.slice(1)), t, minute: Math.floor(t / 60), second: t % 60, period: t < 2700 ? 1 : 2, type, team: 'north-city', player_id: 'NCF09', player_name: 'Kai Lindqvist',
  related_player_id: null, related_player_name: null, outcome: null, x: 90, y: 34, end_x: null, end_y: null, pitch_x: 90, pitch_y: 34, pitch_end_x: null, pitch_end_y: null,
  xg: null, progressive: false, final_third_entry: false, box_entry: false, key_pass: false, sequence_id: 1, score_home: 0, score_away: 0, description: '', ...extra,
});

describe('brand kit components import and render', () => {
  it('renders the logo, status badges, team badges and pundit cards from the kit', () => {
    render(<div><PulseLogo height={30} /><StatusBadge status="corrected" /><PunditCard pundit="fan" pick="Kai Lindqvist" /></div>);
    expect(screen.getByRole('img', { name: 'PULSE AI' })).toBeInTheDocument();
    expect(screen.getByText('Corrected')).toBeInTheDocument();
    expect(screen.getByText(PUNDITS.fan.name)).toBeInTheDocument();
    expect(TEAMS['north-city'].badge).toMatch(/\/assets\/teams\/north-city\//);
  });

  it('renders the Match Pulse chart with markers that are clickable', () => {
    const data = Array.from({ length: 91 }, (_, m) => ({ minute: m, value: Math.sin(m / 10) }));
    let clicked: string | undefined;
    render(<MatchPulseChart data={data} minute={60} events={[{ id: 'I1', minute: 20, kind: 'goal', label: 'Goal' }]} onEventClick={e => { clicked = e.id; }} />);
    const marker = screen.getByRole('button', { name: "20' Goal" });
    act(() => { marker.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(clicked).toBe('I1');
  });

  it('renders stat bars', () => {
    const base: TeamStats = { team: 'north-city', possession_pct: 60, possession_pct_by_passes: 58, passes: 300, passes_completed: 250, pass_accuracy: 83, progressive_passes: 40, final_third_entries: 20, box_entries: 10, shots: 12, shots_on_target: 5, goals: 2, xg: 1.8, recoveries: 50, tackles: 10, interceptions: 8, corners: 4, fouls: 9, cards: 1, carries: 100 };
    render(<StatsPanel home={base} away={{ ...base, team: 'south-united', possession_pct: 40, shots: 6 }} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Shots')).toBeInTheDocument();
  });
});

describe('replay engine', () => {
  const events = [ev('E1', 0, 'kickoff'), ev('E2', 1000, 'goal', { score_home: 1 }), ev('E3', 3000, 'goal', { score_home: 1, score_away: 1, team: 'south-united' }), ev('E4', 5400, 'fulltime', { score_home: 1, score_away: 1 })];
  const pulse: PulsePoint[] = [0, 30, 1020, 3030, 5400].map(t => ({ t, minute: t / 60, value: 0.1, home: 0.2, away: 0.1, home_events: 1, away_events: 1 }));
  const insights: MomentumInsight[] = [{ id: 'I1', kind: 'goal-buildup', minute: 16, t: 1000, window_start_t: 900, window_end_t: 1000, team: 'north-city', importance: 1, headline: 'Goal', explanation: '', stats: {}, event_ids: ['E2'], evidence: [], ai_explanation: null, ai_explanation_source: null, verification_status: null, marker_kind: 'goal' }];

  it('never reveals future events and keeps score, clock and insights in sync', () => {
    const { result } = renderHook(() => useReplay(events, pulse, insights));
    expect(result.current.visibleEvents).toHaveLength(1);
    expect(result.current.score).toEqual({ home: 0, away: 0 });
    expect(result.current.visibleInsights).toHaveLength(0);
    act(() => result.current.seek(999));
    expect(result.current.visibleEvents).toHaveLength(1);
    act(() => result.current.seek(1000));
    expect(result.current.score).toEqual({ home: 1, away: 0 });
    expect(result.current.visibleInsights).toHaveLength(1);
    expect(result.current.visiblePulse.every(p => p.t <= 1000)).toBe(true);
    expect(result.current.state.status).toBe('first-half');
    act(() => result.current.jumpToMinute(45));
    expect(result.current.state.status).toBe('half-time');
    act(() => result.current.finish());
    expect(result.current.score).toEqual({ home: 1, away: 1 });
    expect(result.current.state.status).toBe('full-time');
    act(() => result.current.reset());
    expect(result.current.state.t).toBe(0);
  });

  it('cycles speed and clamps seeking', () => {
    const { result } = renderHook(() => useReplay(events, pulse, insights));
    const s0 = result.current.state.speed;
    act(() => result.current.cycleSpeed());
    expect(result.current.state.speed).not.toBe(s0);
    act(() => result.current.seek(99999));
    expect(result.current.state.t).toBe(5400);
    act(() => result.current.seek(-5));
    expect(result.current.state.t).toBe(0);
  });
});
