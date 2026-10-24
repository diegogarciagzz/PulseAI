// Broadcast view: the Render stage of the pipeline. Kit overlays go on air over a
// stand-in feed, driven by the replay clock (auto director) or by hand (director desk).
import * as React from 'react';
import {
  Clapperboard, Eraser, Flag, Goal, Maximize, Mic, Minimize, ShieldCheck, Sparkles, Timer, Trophy, TrendingUp, UserRound,
} from 'lucide-react';
import { BroadcastStage, MatchPulseFrame, PUNDITS, ScoreBug, TEAMS, type PunditId } from '../../pulse';
import { ReplayControls } from '../../components/ReplayControls';
import { Panel, clock } from '../../components/common';
import { HALF_T } from '../../hooks/useReplay';
import { api } from '../../services/api';
import { useMatch } from '../../state/MatchContext';
import type { ClaimExample, DebateResult, MomentumInsight } from '../../types/api';
import { OnAir, PulseMini, type OnAirContext } from './cues';
import { PossessionChip, StandInFeed, ballAfter, captionEvent, pickTrail, possessionEvent } from './feed';
import { EMPTY_DIRECTOR, MOMENTUM_KINDS, autoCues, directorReducer, type Cue, type CueKind } from './director';

const PUNDIT_ORDER: PunditId[] = ['analyst', 'fan', 'tactician'];

interface CueButton { key: string; kind?: CueKind; label: string; icon: React.ReactNode; enabled: boolean; hint?: string; run: () => void; tone?: 'moment' }

const short = (text: string, max = 56) => { const t = text.trim(); return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t; };

const latest = (list: MomentumInsight[], ok: (i: MomentumInsight) => boolean) =>
  list.filter(ok).sort((a, b) => b.window_end_t - a.window_end_t)[0];

export function Broadcast() {
  const { match, events, pulse, insights, replay, capabilities } = useMatch();
  const [dir, dispatch] = React.useReducer(directorReducer, EMPTY_DIRECTOR);
  const [auto, setAuto] = React.useState(true);
  const [showPulse, setShowPulse] = React.useState(true);
  const [showPoss, setShowPoss] = React.useState(true);
  const [roundtable, setRoundtable] = React.useState<{ matchId: string; debate: DebateResult | null; error: string | null } | null>(null);
  const [debateBusy, setDebateBusy] = React.useState(false);
  const [examples, setExamples] = React.useState<ClaimExample[]>([]);
  const [claim, setClaim] = React.useState('');
  const [fullscreen, setFullscreen] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [requests] = React.useState(() => new Map<string, Promise<unknown>>());
  const seq = React.useRef(0);
  const punditIdx = React.useRef(0);
  const prevT = React.useRef(0);
  const { t, status, playing } = replay.state;
  const tRef = React.useRef(t);
  React.useEffect(() => { tRef.current = t; }, [t]);
  const matchId = match?.meta.id;
  const debate = roundtable?.matchId === matchId ? roundtable?.debate ?? null : null;
  const debateErr = roundtable?.matchId === matchId ? roundtable?.error ?? null : null;

  // New match: clear the rundown and load its example claims.
  React.useEffect(() => {
    dispatch({ type: 'reset' });
    prevT.current = 0;
    if (!matchId) return;
    let off = false;
    api.claimExamples(matchId).then(ex => {
      if (off) return;
      setExamples(ex);
      setClaim((ex.find(e => e.category === 'false-numeric') ?? ex[0])?.text ?? '');
    }).catch(() => undefined);
    return () => { off = true; };
  }, [matchId]);

  // Auto director: react to what the replay clock just revealed.
  React.useEffect(() => {
    const prev = prevT.current;
    prevT.current = t;
    if (t < prev) { dispatch({ type: t === 0 ? 'reset' : 'clear' }); return; }
    if (!auto || t === prev) return;
    for (const cues of autoCues(prev, t, events, insights)) dispatch({ type: 'enqueue', cues });
  }, [t, auto, events, insights]);

  // Time on air.
  const current = dir.current;
  React.useEffect(() => {
    if (!current || current.ms === null) return;
    const h = window.setTimeout(() => dispatch({ type: 'next', t: tRef.current }), current.ms);
    return () => window.clearTimeout(h);
  }, [current]);

  React.useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const visible = replay.visibleEvents;
  const lastGoal = React.useMemo(() => [...visible].reverse().find(e => e.type === 'goal'), [visible]);
  const onBall = React.useMemo(() => [...visible].reverse().find(e => e.player_id), [visible]);
  const ballEvent = React.useMemo(() => [...visible].reverse().find(e => e.pitch_x !== null && e.pitch_y !== null), [visible]);
  const trail = React.useMemo(() => pickTrail(visible, t), [visible, t]);
  const possession = React.useMemo(() => possessionEvent(visible), [visible]);
  const caption = React.useMemo(() => captionEvent(visible, t, replay.state.speed), [visible, t, replay.state.speed]);
  const numbers = React.useMemo(() => Object.fromEntries(Object.values(match?.teams ?? {}).flatMap(tm => tm.players.map(p => [p.id, p.number]))), [match]);
  const goalsSoFar = React.useMemo(() => visible.filter(e => e.type === 'goal'), [visible]);
  const lastMomentum = latest(replay.visibleInsights, i => MOMENTUM_KINDS.has(i.kind));
  const lastForAi = latest(replay.visibleInsights, i => i.kind !== 'goal-buildup' && i.importance >= 0.6) ?? latest(replay.visibleInsights, () => true);
  const fullTime = status === 'full-time';

  const ensureDebate = async (): Promise<DebateResult | null> => {
    if (debate) return debate;
    if (!matchId) return null;
    setDebateBusy(true);
    try { const d = await api.debate(matchId); setRoundtable({ matchId, debate: d, error: null }); return d; }
    catch (e) { setRoundtable({ matchId, debate: null, error: e instanceof Error ? e.message : String(e) }); return null; }
    finally { setDebateBusy(false); }
  };

  const take = (c: Omit<Cue, 'id' | 'auto' | 'high' | 'ms'> & { high?: boolean }) =>
    dispatch({ type: 'take', cue: { high: false, ...c, id: `manual-${c.kind}-${++seq.current}`, auto: false, ms: null } });

  const buttons: CueButton[] = [
    { key: 'g', kind: 'goal', label: 'Goal', icon: <Goal />, tone: 'moment', enabled: !!lastGoal, hint: 'Latest goal',
      run: () => lastGoal && take({ kind: 'goal', at: lastGoal.t, high: true, label: `Goal: ${lastGoal.player_name}`, event: lastGoal }) },
    { key: 's', kind: 'player', label: 'Player stats', icon: <UserRound />, enabled: !!(lastGoal ?? onBall), hint: 'Latest scorer, or the player on the ball',
      run: () => { const e = lastGoal ?? onBall; if (e) take({ kind: 'player', at: t, label: `Player card: ${e.player_name}`, playerId: e.player_id ?? undefined, playerName: e.player_name ?? undefined }); } },
    { key: 'm', kind: 'momentum', label: 'Momentum', icon: <TrendingUp />, enabled: !!lastMomentum, hint: 'Latest momentum swing or pressure spell',
      run: () => lastMomentum && take({ kind: 'momentum', at: lastMomentum.window_end_t, label: lastMomentum.headline, insight: lastMomentum }) },
    { key: 'i', kind: 'ai-insight', label: 'AI insight', icon: <Sparkles />, enabled: !!lastForAi, hint: 'Explains the latest detected moment with Foundry, checked by Narrative VAR',
      run: () => lastForAi && take({ kind: 'ai-insight', at: lastForAi.window_end_t, label: `AI insight: ${lastForAi.headline}`, insight: lastForAi }) },
    { key: 'v', kind: 'var', label: 'Narrative VAR', icon: <ShieldCheck />, enabled: claim.trim().length > 0, hint: 'Fact-checks the claim in the VAR desk',
      run: () => take({ kind: 'var', at: t, label: `VAR: ${short(claim)}`, claim: claim.trim() }) },
    { key: 'n', kind: 'pundit', label: debateBusy ? 'Convening' : 'Pundit', icon: <Mic />, enabled: fullTime && !debateBusy, hint: fullTime ? 'Next pundit from the AI roundtable' : 'Available at full-time',
      run: () => { void ensureDebate().then(d => { if (!d) return; const p = PUNDIT_ORDER[punditIdx.current++ % 3]; take({ kind: 'pundit', at: t, label: `Pundit: ${PUNDITS[p].name}`, pundit: p }); }); } },
    { key: 'o', kind: 'potm', label: debateBusy ? 'Convening' : 'Player of the Match', icon: <Trophy />, enabled: fullTime && !debateBusy, hint: fullTime ? 'Verdict of the AI roundtable' : 'Available at full-time',
      run: () => { void ensureDebate().then(d => { if (d) take({ kind: 'potm', at: t, high: true, label: `Player of the Match: ${d.verdict_name}` }); }); } },
    { key: 'h', kind: 'halftime', label: 'Half-time', icon: <Timer />, enabled: t >= HALF_T, hint: t >= HALF_T ? 'First-half title card' : 'Available from half-time',
      run: () => take({ kind: 'halftime', at: HALF_T, high: true, label: 'Half-time analysis' }) },
    { key: 't', kind: 'fulltime', label: 'Full-time', icon: <Flag />, enabled: fullTime, hint: fullTime ? 'Full-time recap card' : 'Available at full-time',
      run: () => take({ kind: 'fulltime', at: t, high: true, label: 'Full-time recap' }) },
    { key: 'c', label: 'Clear', icon: <Eraser />, enabled: !!dir.current || dir.queue.length > 0, hint: 'Take everything off air', run: () => dispatch({ type: 'clear' }) },
  ];

  // Keyboard shortcuts, handy while presenting in full screen.
  const keys = React.useRef<Record<string, () => void>>({});
  React.useEffect(() => {
    keys.current = { ...Object.fromEntries(buttons.filter(b => b.enabled).map(b => [b.key, b.run])), f: toggleFullscreen, ' ': replay.toggle };
  });
  React.useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable))) return;
      const fn = keys.current[ev.key.toLowerCase()];
      if (fn) { ev.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!match) return null;
  const { home, away } = match.meta;
  const ctx: OnAirContext = {
    matchId: match.meta.id, home, away, events, pulse, insights, debate, aiMode: capabilities?.ai_mode ?? 'demo', requests,
  };
  const title = current?.kind === 'halftime' || current?.kind === 'fulltime';
  // the mini chart sits top-right (clear of the near touchline); it gives way to any graphic
  const pulseOn = showPulse && !current;

  return (
    <>
      <ReplayControls compact />
      <div className="bc-frame" ref={frameRef} data-fullscreen={fullscreen || undefined}>
        <div className="bc-stage-wrap">
          <BroadcastStage background={<StandInFeed trail={trail} ball={ballEvent ? ballAfter(ballEvent, home) : null} home={home} numbers={numbers} />}>
            {!title && <ScoreBug home={home} away={away} homeScore={replay.score.home} awayScore={replay.score.away} clock={clock(t)} live={playing} />}
            {!title && showPoss && <PossessionChip possession={possession} caption={caption} home={home} speed={replay.state.speed} />}
            {pulseOn && (
              <MatchPulseFrame homeLabel={TEAMS[home].short} awayLabel={TEAMS[away].short}>
                <PulseMini pulse={replay.visiblePulse} goals={goalsSoFar} home={home} />
              </MatchPulseFrame>
            )}
            {current && <OnAir key={current.id} cue={current} ctx={ctx} />}
          </BroadcastStage>
        </div>
        <button className="bc-fs-exit btn btn--ghost btn--sm" onClick={toggleFullscreen} aria-label="Exit full screen"><Minimize />Exit full screen (F)</button>
      </div>

      <div className="bc-desk">
        <Panel overline="Director" title="Graphics on demand">
          <div className="bc-toolbar">
            <div className="btn-group" role="group" aria-label="Director mode">
              <button aria-pressed={auto} onClick={() => setAuto(true)} title="Graphics follow the event stream">AUTO</button>
              <button aria-pressed={!auto} onClick={() => setAuto(false)} title="Only manual cues">MANUAL</button>
            </div>
            <div className="btn-group" role="group" aria-label="Stage layers">
              <button aria-pressed={showPulse} onClick={() => setShowPulse(v => !v)} title="Show the Match Pulse mini chart when nothing else is on air">PULSE CHART</button>
              <button aria-pressed={showPoss} onClick={() => setShowPoss(v => !v)} title="Show who has the ball and the latest action under the score bug">PLAY-BY-PLAY</button>
            </div>
            <button className="btn btn--primary btn--sm" onClick={toggleFullscreen}><Maximize />Full screen</button>
          </div>
          <div className="cue-grid">
            {buttons.map(b => (
              <button key={b.key} className={`btn cue-btn${b.tone === 'moment' ? ' cue-btn--moment' : ''}`} disabled={!b.enabled} onClick={b.run}
                title={b.hint} aria-keyshortcuts={b.key.toUpperCase()} data-on-air={b.kind && current?.kind === b.kind ? '' : undefined}>
                {b.icon}<span>{b.label}</span><kbd>{b.key.toUpperCase()}</kbd>
              </button>
            ))}
          </div>
          <p className="pulse-text-caption muted" style={{ margin: '12px 0 0' }}>
            Auto mode airs goals, player cards, major momentum moments and title cards as the replay reveals them. Manual cues stay on air until you clear them.
            Keys: Space play or pause, F full screen. {debateErr && <span style={{ color: 'var(--pulse-status-unsupported)' }}>Roundtable failed: {debateErr}</span>}
            {debateBusy && <span> Convening the AI roundtable{capabilities?.ai_mode === 'foundry' ? ' on Microsoft Foundry (about 30 seconds)' : ''}.</span>}
          </p>
        </Panel>

        <Panel overline="Narrative VAR desk" title="Fact-check a line on air">
          <div className="stack" style={{ gap: 10 }}>
            <select className="select" aria-label="Example claims" value="" onChange={e => { if (e.target.value) setClaim(e.target.value); }}>
              <option value="">Load an example claim</option>
              {examples.map(ex => <option key={ex.label} value={ex.text}>{ex.label}</option>)}
            </select>
            <textarea className="claim-input bc-claim" value={claim} onChange={e => setClaim(e.target.value)} aria-label="Claim to check on air"
              placeholder="Type a line a commentator might say" />
            <button className="btn btn--primary" disabled={!claim.trim()} onClick={() => take({ kind: 'var', at: t, label: `VAR: ${short(claim)}`, claim: claim.trim() })}>
              <ShieldCheck />Check on air at {clock(t)}
            </button>
          </div>
        </Panel>

        <Panel overline="Rundown" title={current ? 'On air' : 'Clean feed'}
          right={<span className="mode-badge" data-mode={current ? 'foundry' : 'unknown'}><i />{current ? (current.auto ? 'AUTO' : 'MANUAL') : 'IDLE'}</span>}>
          <div className="rundown">
            {current ? <div className="rundown__now"><Clapperboard size={16} /><b>{current.label}</b></div> : <div className="rundown__now muted">Score bug and Match Pulse only</div>}
            {dir.queue.length > 0 && <div className="rundown__next muted">Next: {dir.queue.map(q => q.label).join('  ·  ')}</div>}
            <ol className="rundown__log" aria-label="Aired graphics">
              {[...dir.log].reverse().map((c, k) => (
                <li key={`${c.id}-${k}`}><span className="mono">{clock(c.at)}</span><span>{c.label}</span><em>{c.auto ? 'auto' : 'manual'}</em></li>
              ))}
              {dir.log.length === 0 && <li className="muted"><span /><span>Start the replay. Graphics appear here as they air.</span><em /></li>}
            </ol>
          </div>
        </Panel>
      </div>
    </>
  );
}
