import { FastForward, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { FULL_T, HALF_T, SPEEDS } from '../hooks/useReplay';
import { useMatch } from '../state/MatchContext';
import { clock } from './common';

const MARKER: Record<string, string> = { goal: 'goal-event', 'momentum-swing': 'momentum-shift', 'pressure-surge': 'attacking-pressure' };

export function ReplayControls({ compact = false }: { compact?: boolean }) {
  const { match, replay, scenarios, loadScenario, loading } = useMatch();
  if (!match) return null;
  const { state } = replay;
  const pct = (state.t / FULL_T) * 100;
  const goals = match.key_moments.filter(k => k.kind === 'goal');
  return (
    <div className="pulse-card replay" role="group" aria-label="Replay controls">
      <div className="replay__row">
        <label className="pulse-text-caption muted" htmlFor="scenario" style={{ marginRight: 2 }}>Scenario</label>
        <select id="scenario" className="select" value={match.meta.scenario} disabled={loading} onChange={e => loadScenario(e.target.value)}>
          {scenarios.map(s => <option key={s.key} value={s.key}>{s.title}</option>)}
        </select>
        <button className={`btn ${state.playing ? '' : 'btn--primary'}`} onClick={replay.toggle} aria-label={state.playing ? 'Pause replay' : 'Start replay'}>
          {state.playing ? <Pause /> : <Play />}{state.playing ? 'Pause' : state.t > 0 && state.t < FULL_T ? 'Resume' : 'Start replay'}
        </button>
        <button className="btn btn--ghost btn--icon" onClick={replay.reset} aria-label="Reset replay" title="Reset"><RotateCcw /></button>
        <button className="btn btn--ghost" onClick={replay.finish} title="Jump to full-time"><SkipForward />Full-time</button>
        <div className="btn-group" role="group" aria-label="Replay speed">
          {SPEEDS.map(s => <button key={s} aria-pressed={state.speed === s} onClick={() => replay.setSpeed(s)}>{s}x</button>)}
        </div>
        <button className="btn btn--ghost btn--sm" onClick={replay.cycleSpeed} title="Increase speed"><FastForward />Faster</button>
        <span className="replay__spacer" />
        <span className="mono muted" style={{ fontSize: 12 }}>{clock(state.t)} / 90:00</span>
      </div>
      <div className="scrubber">
        <span className="scrubber__fill" style={{ width: `${pct}%` }} />
        <span className="scrubber__marks" aria-hidden>
          <i data-kind="ht" style={{ left: `${(HALF_T / FULL_T) * 100}%` }} />
          {match.key_moments.map(k => <i key={k.label} data-kind={k.kind} style={{ left: `${(k.t / FULL_T) * 100}%` }} />)}
        </span>
        <input type="range" min={0} max={FULL_T} step={1} value={state.t} aria-label="Match time" aria-valuetext={clock(state.t)}
          onChange={e => replay.seek(Number(e.target.value))} />
      </div>
      {!compact && (
        <div className="replay__row">
          <span className="pulse-text-caption muted">Jump to</span>
          <div className="moments">
            {match.key_moments.map(k => (
              <button key={k.label} className="moment-chip" data-kind={k.kind} onClick={() => replay.seek(Math.min(FULL_T, k.t + 3))} title={k.label}>
                <img src={`/assets/match-pulse/markers/${MARKER[k.kind] ?? 'momentum-shift'}.svg`} alt="" />{k.minute}' {k.kind === 'goal' ? `Goal ${k.label.split('GOAL ')[1] ?? ''}` : k.label.replace(/^\d+' /, '')}
              </button>
            ))}
            {goals.length === 0 && <span className="muted pulse-text-caption">No key moments yet</span>}
          </div>
        </div>
      )}
    </div>
  );
}
