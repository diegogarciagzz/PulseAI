import { EvidenceMeter, StatusBadge, TEAMS } from '../../pulse';
import { EventFeed } from '../../components/EventFeed';
import { InsightCard } from '../../components/InsightCard';
import { MiniPitch } from '../../components/MiniPitch';
import { ReplayControls } from '../../components/ReplayControls';
import { Scoreboard } from '../../components/Scoreboard';
import { COMPACT_ROWS, StatsPanel } from '../../components/StatsPanel';
import { Panel } from '../../components/common';
import { useMatch } from '../../state/MatchContext';
import { PulseChartPanel } from '../match-pulse/PulseChartPanel';

export function LiveMatch() {
  const { match, replay, serverState, selectInsight, setView } = useMatch();
  if (!match) return null;
  const home = TEAMS[match.meta.home], away = TEAMS[match.meta.away];
  const insights = replay.visibleInsights;
  const latest = [...insights].sort((a, b) => b.t - a.t || b.importance - a.importance).slice(0, 3);
  const lastPulse = replay.visiblePulse[replay.visiblePulse.length - 1];
  const leading = lastPulse ? (lastPulse.value > 0.12 ? home : lastPulse.value < -0.12 ? away : null) : null;
  const stats = serverState && serverState.t === replay.state.t ? serverState : null;
  return (
    <>
      <Scoreboard />
      <ReplayControls />
      <div className="grid-live">
        <Panel className="pulse-chart" overline="Match Pulse" title={leading ? `Momentum is with ${leading.name.replace(' FC', '')}` : 'Momentum is balanced'}
          sub="Attacking actions, final-third entries, shots and high ball wins, smoothed every 30 seconds. An activity index, not a scoring probability."
          right={<div className="legend"><span><i style={{ background: home.color }} />{home.name}</span><span><i style={{ background: away.color }} />{away.name}</span>
            <span><img src="/assets/match-pulse/markers/goal-event.svg" alt="" />Goal</span><span><img src="/assets/match-pulse/markers/momentum-shift.svg" alt="" />Shift</span>
            <span><img src="/assets/match-pulse/markers/attacking-pressure.svg" alt="" />Pressure</span></div>}>
          <PulseChartPanel height={300} onSelect={i => { selectInsight(i.id); setView('pulse'); }} />
          <div className="legend" style={{ marginTop: 10 }}>
            <span className="mono">{home.short} {lastPulse ? lastPulse.home.toFixed(2) : '0.00'}</span>
            <span className="mono">{away.short} {lastPulse ? lastPulse.away.toFixed(2) : '0.00'}</span>
            <span>Click a marker to inspect the evidence behind it.</span>
          </div>
        </Panel>
        <aside className="side">
          <Panel overline="Match statistics" right={<span className="pulse-text-caption muted mono">{stats ? `to ${stats.minute}'` : 'syncing'}</span>}>
            {stats ? <StatsPanel home={stats.home_stats} away={stats.away_stats} rows={COMPACT_ROWS} /> : <div className="muted pulse-text-body-sm">Waiting for server state.</div>}
          </Panel>
          <Panel overline="Live event feed">
            <EventFeed events={replay.visibleEvents} limit={30} />
          </Panel>
        </aside>
      </div>
      <div className="grid-3">
        <Panel overline="Pitch map, last 3 minutes" right={<span className="pulse-text-caption muted">progressive passes, ball wins, shots</span>}>
          <MiniPitch events={replay.visibleEvents} />
        </Panel>
        <Panel overline="PULSE AI insights" right={<button className="btn btn--ghost btn--sm" onClick={() => setView('pulse')}>Open Match Pulse</button>}>
          {latest.length === 0 ? <div className="feed__empty">Insights appear once their evidence window has closed.</div> : (
            <div className="stack">{latest.map(i => <InsightCard key={i.id} insight={i} dense onSelect={ins => { selectInsight(ins.id); setView('pulse'); }} />)}</div>
          )}
        </Panel>
        <Panel overline="Evidence indicators">
          <div className="stack">
            <div className="row-between"><span className="muted pulse-text-body-sm">Events observed</span><b className="mono">{replay.visibleEvents.length} / {match.meta.event_count}</b></div>
            <div className="row-between"><span className="muted pulse-text-body-sm">Insights detected</span><b className="mono">{insights.length}</b></div>
            <div className="row-between"><span className="muted pulse-text-body-sm">Evidence per insight</span><EvidenceMeter value={Math.min(5, Math.round((insights.reduce((a, i) => a + i.event_ids.length, 0) / Math.max(1, insights.length)) / 3))} /></div>
            <div className="row-between"><span className="muted pulse-text-body-sm">Commentary checks</span><StatusBadge status="verified" label="Narrative VAR ready" /></div>
            <button className="btn btn--primary" onClick={() => setView('var')}>Verify a claim</button>
          </div>
        </Panel>
      </div>
    </>
  );
}
