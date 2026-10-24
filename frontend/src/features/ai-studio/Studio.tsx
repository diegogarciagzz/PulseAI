import * as React from 'react';
import { Mic, RotateCcw } from 'lucide-react';
import { PUNDITS, PunditCard, StatusBadge, TEAMS, type PunditId } from '../../pulse';
import { Scoreboard } from '../../components/Scoreboard';
import { ErrorState, Loading, Notice, Panel } from '../../components/common';
import { api } from '../../services/api';
import { useMatch } from '../../state/MatchContext';
import type { DebateResult, PunditArgument } from '../../types/api';

const ORDER: PunditId[] = ['analyst', 'fan', 'tactician'];
const STEP_MS = 1400;

export function Studio() {
  const { match, replay, capabilities } = useMatch();
  const [debate, setDebate] = React.useState<DebateResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState(0);
  const [speaking, setSpeaking] = React.useState<PunditId | null>(null);
  const [showCandidates, setShowCandidates] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  React.useEffect(() => { setDebate(null); setRevealed(0); }, [match?.meta.id]);

  const start = async (refresh = false) => {
    if (!match) return;
    setBusy(true); setErr(null); setDebate(null); setRevealed(0); timers.current.forEach(clearTimeout); timers.current = [];
    try {
      const d = await (refresh ? fetch(`/api/matches/${match.meta.id}/debate?refresh=true`, { method: 'POST' }).then(r => r.json() as Promise<DebateResult>) : api.debate(match.meta.id));
      setDebate(d);
      d.arguments.forEach((a, i) => {
        timers.current.push(window.setTimeout(() => { setRevealed(i + 1); setSpeaking(a.pundit); }, i * STEP_MS));
      });
      timers.current.push(window.setTimeout(() => { setRevealed(d.arguments.length + 1); setSpeaking(null); }, d.arguments.length * STEP_MS));
      timers.current.push(window.setTimeout(() => setRevealed(d.arguments.length + 2), (d.arguments.length + 1) * STEP_MS));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!match) return null;
  const fullTime = replay.state.status === 'full-time';
  const picks = debate ? Object.fromEntries(ORDER.map(p => [p, debate.arguments.find(a => a.pundit === p && a.round === (revealed > 3 ? 'rebuttal' : 'opening'))?.pick_name])) : {};
  const shown = debate ? debate.arguments.slice(0, Math.min(revealed, debate.arguments.length)) : [];
  const verdictVisible = debate && revealed >= debate.arguments.length + 2;

  return (
    <>
      <Scoreboard />
      <section className="pulse-card studio-hero">
        <div>
          <div className="pulse-overline">AI Post-Match Studio</div>
          <h2 className="pulse-text-heading-xl" style={{ margin: '8px 0 6px' }}>Who deserves to be Player of the Match?</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 680 }}>Three original PULSE AI pundits argue from different evidence: the Analyst from volume statistics, the Fan from decisive moments, the Tactician from team-level influence. Every factual sentence is checked by Narrative VAR before it reaches the screen.</p>
          <div className="row-between" style={{ marginTop: 16, justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--moment" onClick={() => start(false)} disabled={busy}><Mic />{busy ? 'Convening the panel' : debate ? 'Replay debate' : 'Start debate'}</button>
            {debate && <button className="btn btn--ghost" onClick={() => start(true)} disabled={busy} title="Discard the cached debate and run the agents again"><RotateCcw />Run again</button>}
            {!fullTime && <span className="pulse-text-caption muted">The debate uses full-match statistics. Your replay is at {replay.state.minute}', so it previews the final verdict.</span>}
            {capabilities && <span className="pulse-text-caption muted">{capabilities.ai_mode === 'foundry' ? 'Agents run on Microsoft Agent Framework with Foundry models.' : 'Demo mode: arguments are templated from computed statistics; Foundry agents run when configured.'}</span>}
          </div>
        </div>
        <div className="studio-avatars" aria-hidden>{ORDER.map(p => <img key={p} src={PUNDITS[p].avatar} alt="" />)}</div>
      </section>

      {err && <ErrorState title="The debate could not be generated" detail={err} />}
      {busy && <Loading label="Computing candidates, running the pundits, checking every claim" />}

      <div className="studio-grid pulse-stagger">
        {ORDER.map(p => {
          const openArg = shown.find(a => a.pundit === p && a.round === 'opening');
          const rebut = shown.find(a => a.pundit === p && a.round === 'rebuttal');
          return (
            <PunditCard key={p} pundit={p} pick={picks[p] ?? undefined} speaking={speaking === p}>
              <img className="pundit-portrait" src={speaking === p ? PUNDITS[p].portrait.replace('-portrait-1024', '-portrait-speaking-1024') : PUNDITS[p].portrait} alt={`${PUNDITS[p].name}, ${PUNDITS[p].role}`} style={{ marginBottom: 14 }} />
              <div className="argument">
                {!debate && <p className="muted">{PERSONA_BLURB[p]}</p>}
                {openArg && <ArgumentBlock a={openArg} />}
                {rebut && <ArgumentBlock a={rebut} />}
              </div>
            </PunditCard>
          );
        })}
      </div>

      {debate && revealed > debate.arguments.length && (
        <Panel overline="Moderator" title="Where the panel lands" className="fade-in">
          <p style={{ margin: 0, color: 'var(--pulse-text-secondary)' }}>{debate.moderator_summary}</p>
          <div className="legend" style={{ marginTop: 10 }}>
            <span className="muted">Rounds: {debate.rounds} (bounded)</span>
            <span className="muted">Claims checked: {debate.arguments.reduce((n, a) => n + (a.verification?.claims.length ?? 0), 0)}</span>
            <span className="muted">Mode: {debate.ai_mode}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowCandidates(s => !s)}>{showCandidates ? 'Hide' : 'Show'} candidate scores</button>
          </div>
          {showCandidates && (
            <table className="candidate-table" style={{ marginTop: 12 }}>
              <thead><tr><th>Player</th><th>Team</th><th className="num">Analyst</th><th className="num">Fan</th><th className="num">Tactician</th><th className="num">Composite</th></tr></thead>
              <tbody>{debate.candidates.map(c => <tr key={c.player_id}><td>{c.name} <span className="muted">#{c.number} {c.role}</span></td><td>{TEAMS[c.team].short}</td><td className="num">{c.analyst_score.toFixed(1)}</td><td className="num">{c.fan_score.toFixed(1)}</td><td className="num">{c.tactician_score.toFixed(1)}</td><td className="num"><b>{c.composite.toFixed(2)}</b></td></tr>)}</tbody>
            </table>
          )}
        </Panel>
      )}

      {verdictVisible && debate && (
        <section className="pulse-card pulse-card--moment pulse-spotlight verdict fade-in" aria-label="Player of the Match">
          <img src={`/assets/teams/${debate.verdict_team}/${debate.verdict_team}-jersey-home.svg`} alt="" />
          <div>
            <div className="pulse-overline" style={{ color: 'var(--pulse-moment)' }}>Player of the Match · AI roundtable verdict</div>
            <div className="verdict__name">{debate.verdict_name}</div>
            <div className="muted" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src={TEAMS[debate.verdict_team].badgeSmall} alt="" height={22} />{TEAMS[debate.verdict_team].name} · #{debate.verdict_number}</div>
            <div className="row-between" style={{ marginTop: 14, justifyContent: 'flex-start', gap: 24 }}>
              <div><div className="verdict__rating">{debate.verdict_rating}</div><div className="pulse-text-caption muted">PULSE RATING</div></div>
              <div className="kv" style={{ flex: 1 }}>{debate.verdict_stats.map(s => <div key={s.label}><span>{s.label}</span><b>{s.value}</b></div>)}</div>
            </div>
            <div className="votes">
              {debate.votes.map(v => <img key={v.pundit} src={PUNDITS[v.pundit as PunditId].thumb} alt={`${PUNDITS[v.pundit as PunditId].name} ${v.agrees ? 'agrees' : 'disagrees'}`} data-agree={v.agrees} title={`${PUNDITS[v.pundit as PunditId].name}: ${v.pick}`} />)}
              <span className="muted pulse-text-body-sm"><b style={{ color: 'var(--pulse-text)' }}>{debate.votes.filter(v => v.agrees).length} of {debate.votes.length} pundits</b> agree{debate.unanimous ? ', unanimous' : ', the disagreement is acknowledged'}</span>
            </div>
          </div>
        </section>
      )}

      {debate && !verdictVisible && revealed > 0 && <Notice>Debate in progress: {revealed <= 3 ? 'opening arguments' : revealed <= 6 ? 'rebuttal round' : 'moderator summary'}.</Notice>}
    </>
  );
}

const PERSONA_BLURB: Record<PunditId, string> = {
  analyst: 'Measures everything. Pass completion, progressive passes, defensive actions and shots on target decide the argument.',
  fan: 'Lives for the big moments. Goals, assists, equalisers and winners. If it made the stadium shake, it counts.',
  tactician: 'Sees the structure. Progressive actions, pre-assists, recoveries and how a player makes teammates better.',
};

function ArgumentBlock({ a }: { a: PunditArgument }) {
  const v = a.verification;
  return (
    <div className="fade-in">
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="pulse-text-caption muted">{a.round === 'opening' ? 'Opening' : 'Rebuttal'} · pick {a.pick_name} · {a.source}</span>
        {v && <StatusBadge status={v.status} />}
      </div>
      <p>{a.text}</p>
      {v && v.claims.some(c => c.status === 'corrected' || c.status === 'unsupported') && (
        <p className="pulse-text-body-sm" style={{ color: 'var(--pulse-status-corrected)' }}>Narrative VAR: {v.summary} {v.corrected_text ? `Corrected: ${v.corrected_text}` : ''}</p>
      )}
    </div>
  );
}
