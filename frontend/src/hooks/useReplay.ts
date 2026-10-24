import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchEvent, MomentumInsight, PulsePoint } from '../types/api';

export const FULL_T = 90 * 60;
export const HALF_T = 45 * 60;
export const SPEEDS = [1, 10, 30, 60, 120, 300] as const;
export type Speed = (typeof SPEEDS)[number];

export interface ReplayState {
  t: number;
  playing: boolean;
  speed: Speed;
  status: 'pre-match' | 'first-half' | 'half-time' | 'second-half' | 'full-time';
  minute: number;
  second: number;
}

/**
 * Deterministic client-side replay clock. The server generated every event up front;
 * the client only decides *how much of the timeline is visible*. Nothing after `t`
 * is ever rendered, so future events are never leaked during playback.
 */
export function useReplay(events: MatchEvent[], pulse: PulsePoint[], insights: MomentumInsight[]) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(30);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    if (!playing) { if (raf.current) cancelAnimationFrame(raf.current); raf.current = null; return; }
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      const next = Math.min(FULL_T, tRef.current + dt * speed);
      setT(next);
      if (next >= FULL_T) { setPlaying(false); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, speed]);

  const play = useCallback(() => { if (tRef.current >= FULL_T) setT(0); setPlaying(true); }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => { if (playing) pause(); else play(); }, [playing, play, pause]);
  const reset = useCallback(() => { setPlaying(false); setT(0); }, []);
  const seek = useCallback((seconds: number) => setT(Math.max(0, Math.min(FULL_T, seconds))), []);
  const jumpToMinute = useCallback((minute: number) => seek(minute * 60), [seek]);
  const finish = useCallback(() => { setPlaying(false); setT(FULL_T); }, []);
  const cycleSpeed = useCallback(() => setSpeed(s => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]), []);

  const ti = Math.floor(t);
  const visibleEvents = useMemo(() => events.filter(e => e.t <= ti), [events, ti]);
  const visiblePulse = useMemo(() => pulse.filter(p => p.t <= ti), [pulse, ti]);
  const visibleInsights = useMemo(() => insights.filter(i => i.window_end_t <= ti), [insights, ti]);
  const lastEvent = visibleEvents[visibleEvents.length - 1];
  const score = { home: lastEvent?.score_home ?? 0, away: lastEvent?.score_away ?? 0 };
  const status: ReplayState['status'] = ti <= 0 ? 'pre-match' : ti < HALF_T ? 'first-half' : ti === HALF_T ? 'half-time' : ti < FULL_T ? 'second-half' : 'full-time';

  const state: ReplayState = { t: ti, playing, speed, status, minute: Math.floor(ti / 60), second: ti % 60 };
  return { state, play, pause, toggle, reset, seek, jumpToMinute, finish, setSpeed, cycleSpeed, visibleEvents, visiblePulse, visibleInsights, score };
}
