import * as React from 'react';
import { AttackingDirection, PassArrow, Pitch, RecoveryMarker, ShotMarker, EventHighlight } from '../pulse';
import type { MatchEvent } from '../types/api';

/**
 * Last-N-events map on the brand-kit pitch. Coordinates come straight from the
 * server's fixed display frame (home attacks left to right).
 */
export function MiniPitch({ events, windowSeconds = 180, highlight }: { events: MatchEvent[]; windowSeconds?: number; highlight?: MatchEvent | null }) {
  const last = events[events.length - 1];
  const t = last?.t ?? 0;
  const recent = React.useMemo(() => events.filter(e => e.t >= t - windowSeconds && e.pitch_x !== null), [events, t, windowSeconds]);
  const shots = recent.filter(e => e.type === 'shot');
  const wins = recent.filter(e => e.type === 'recovery' || e.type === 'interception' || e.type === 'tackle');
  const passes = recent.filter(e => e.type === 'pass' && e.outcome === 'complete' && (e.progressive || e.key_pass || e.final_third_entry)).slice(-14);
  return (
    <div className="pitch-box">
      <Pitch title="Recent actions on the pitch">
        <AttackingDirection y={3} from={6} to={24} label="NCF ATTACK" />
        <AttackingDirection y={65.5} from={99} to={81} label="SUF ATTACK" />
        {passes.map(p => <PassArrow key={p.id} from={{ x: p.pitch_x!, y: p.pitch_y! }} to={{ x: p.pitch_end_x!, y: p.pitch_end_y! }} kind={p.key_pass ? 'key' : 'completed'} />)}
        {wins.map(w => <RecoveryMarker key={w.id} x={w.pitch_x!} y={w.pitch_y!} size={1.6} />)}
        {shots.map(s => <ShotMarker key={s.id} x={s.pitch_x!} y={s.pitch_y!} xg={s.xg ?? 0.1} goal={s.outcome === 'goal'} />)}
        {highlight && highlight.pitch_x !== null && <EventHighlight x={highlight.pitch_x} y={highlight.pitch_y!} />}
      </Pitch>
    </div>
  );
}
