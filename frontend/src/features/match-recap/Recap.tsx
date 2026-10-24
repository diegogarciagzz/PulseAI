import * as React from 'react';
import { PulseLogo, StatusBadge, TEAMS } from '../../pulse';
import { InsightCard } from '../../components/InsightCard';
import { Scoreboard } from '../../components/Scoreboard';
import { StatsPanel } from '../../components/StatsPanel';
import { ErrorState, EventIcon, Loading, Panel } from '../../components/common';
import { api } from '../../services/api';
import { useMatch } from '../../state/MatchContext';
import type { EventType, MatchRecap, PlayerStats } from '../../types/api';
import { PulseChartPanel } from '../match-pulse/PulseChartPanel';

export function Recap() {
  const { match, replay, selectInsight, setView } = useMatch();
  const [mode, setMode] = React.useState<'fan' | 'analyst'>('fan');
  const [lang, setLang] = React.useState<'en' | 'es'>('en');
  const [recap, setRecap] = React.useState<MatchRecap | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!match) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    api.recap(match.meta.id, mode, lang).then(r => { if (!cancelled) setRecap(r); }).catch(e => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [match, mode, lang]);

  if (!match) return null;
  const notFT = replay.state.status !== 'full-time';
  return (
    <>
      <Scoreboard />
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div>
          <div className="pulse-overline">Match Recap</div>
          <h2 className="pulse-text-heading-xl" style={{ margin: '8px 0 0' }}>{recap?.headline ?? `${TEAMS[match.meta.home].name} vs ${TEAMS[match.meta.away].name}`}</h2>
          {notFT && <p className="muted pulse-text-body-sm" style={{ margin: '6px 0 0' }}>Recap covers the full match. Press Full-time in the replay controls to catch the scoreboard up.</p>}
        </div>
        <div className="row-between" style={{ gap: 10 }}>
          <div className="btn-group" role="group" aria-label="Recap mode">
            <button aria-pressed={mode === 'fan'} onClick={() => setMode('fan')}>Fan mode</button>
            <button aria-pressed={mode === 'analyst'} onClick={() => setMode('analyst')}>Analyst mode</button>
          </div>
          <div className="btn-group" role="group" aria-label="Language">
            <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
            <button aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
          </div>
        </div>
      </div>
      {err && <ErrorState title="Recap unavailable" detail={err} />}
      {loading && !recap && <Loading label="Building the recap" />}
      {recap && (
        <div className="grid-recap fade-in" key={`${mode}-${lang}`}>
          <div className="stack">
            <Panel overline={mode === 'fan' ? 'The story' : 'The analysis'} right={<span className="legend"><span className="pulse-text-caption muted">{recap.summary_source === 'foundry' ? 'Microsoft Foundry' : 'Demo mode · deterministic'}</span>{recap.summary_status && <StatusBadge status={recap.summary_status} label={`Narrative VAR: ${recap.summary_status}`} />}</span>}>
              <p style={{ margin: 0, font: '500 17px/1.55 var(--pulse-font-ui)', color: 'var(--pulse-text)' }}>{recap.summary}</p>
            </Panel>
            <Panel className="pulse-chart" overline="Momentum timeline">
              <PulseChartPanel height={240} minImportance={0.6} onSelect={i => { selectInsight(i.id); setView('pulse'); }} />
            </Panel>
            <Panel overline="Most important momentum shifts" sub="Each explanation was re-checked by Narrative VAR against the event log.">
              <div className="stack">
                {recap.verified_insights.map(s => (
                  <div className="claim-row" key={s.title}>
                    <div className="row-between"><b>{s.title}</b>{s.status && <StatusBadge status={s.status} />}</div>
                    <p className="muted pulse-text-body-sm">{s.body}</p>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel overline="Player performances">
              <table className="candidate-table">
                <thead><tr><th>Player</th><th className="num">Min</th><th className="num">G</th><th className="num">A</th><th className="num">Prog.</th><th className="num">Key</th><th className="num">Rec.</th><th className="num">Pass %</th></tr></thead>
                <tbody>{recap.top_players.map((p: PlayerStats) => <tr key={p.player_id}><td><span style={{ color: TEAMS[p.team].color }}>●</span> {p.name} <span className="muted">#{p.number}</span></td><td className="num">{p.minutes}</td><td className="num">{p.goals}</td><td className="num">{p.assists}</td><td className="num">{p.progressive_passes}</td><td className="num">{p.key_passes}</td><td className="num">{p.recoveries}</td><td className="num">{p.pass_accuracy.toFixed(0)}</td></tr>)}</tbody>
              </table>
            </Panel>
          </div>
          <aside className="side">
            <Panel overline="Final statistics"><StatsPanel home={recap.team_stats[match.meta.home]} away={recap.team_stats[match.meta.away]} /></Panel>
            <Panel overline="Key events">
              <div className="feed">{recap.key_events.map(e => (
                <div className="feed__row" key={e.event_id} data-type={e.type}>
                  <span className="feed__min">{e.minute}'</span><span className="feed__icon" data-team={e.team ?? undefined}><EventIcon type={e.type as EventType} /></span><span>{e.description}</span>
                </div>))}</div>
            </Panel>
            {recap.player_of_the_match && (
              <Panel overline="Player of the Match" moment>
                <div className="pulse-text-heading-lg">{String(recap.player_of_the_match.name)}</div>
                <div className="muted pulse-text-body-sm">{TEAMS[recap.player_of_the_match.team as 'north-city' | 'south-united'].name} · #{String(recap.player_of_the_match.number)} · {String(recap.player_of_the_match.role)}</div>
                <p className="muted pulse-text-body-sm" style={{ margin: '8px 0 12px' }}>{String(recap.player_of_the_match.note)}</p>
                <button className="btn btn--primary" onClick={() => setView('studio')}>Open the AI Studio debate</button>
              </Panel>
            )}
            <Panel overline="Momentum shifts on the timeline">
              <div className="stack">{recap.momentum_shifts.slice(0, 4).map(i => <InsightCard key={i.id} insight={i} dense onSelect={ins => { selectInsight(ins.id); setView('pulse'); }} />)}</div>
            </Panel>
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12, opacity: 0.7 }}><PulseLogo height={22} variant="mono-white" /></div>
          </aside>
        </div>
      )}
    </>
  );
}
