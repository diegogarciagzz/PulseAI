import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { ClaimCard, EvidenceMeter, StatusBadge, TEAMS } from '../../pulse';
import { InsightCard } from '../../components/InsightCard';
import { ReplayControls } from '../../components/ReplayControls';
import { Scoreboard } from '../../components/Scoreboard';
import { ErrorState, Panel } from '../../components/common';
import { api } from '../../services/api';
import { useMatch } from '../../state/MatchContext';
import type { InsightExplanation, MomentumInsight } from '../../types/api';
import { PulseChartPanel } from './PulseChartPanel';

export function MatchPulse() {
  const { match, replay, selectedInsightId, selectInsight, capabilities } = useMatch();
  const [explanations, setExplanations] = React.useState<Record<string, InsightExplanation>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [minImportance, setMinImportance] = React.useState(0.6);
  if (!match) return null;
  const list = [...replay.visibleInsights].filter(i => i.importance >= minImportance || i.kind === 'goal-buildup').sort((a, b) => b.t - a.t);
  const selected = replay.visibleInsights.find(i => i.id === selectedInsightId) ?? list[0] ?? null;
  const explanation = selected ? explanations[selected.id] : undefined;

  const explain = async (i: MomentumInsight) => {
    setBusy(i.id); setErr(null);
    try { const r = await api.explainInsight(match.meta.id, i.id); setExplanations(x => ({ ...x, [i.id]: r })); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <>
      <Scoreboard />
      <ReplayControls compact />
      <Panel className="pulse-chart" overline="Match Pulse" title="Momentum, minute by minute" sub="Markers are detected moments. Click one to see what happened, why it was highlighted, the events that contributed and the verified explanation.">
        <PulseChartPanel height={340} minImportance={minImportance} onSelect={i => selectInsight(i.id)} />
      </Panel>
      <div className="grid-2">
        <Panel overline="Detected moments" right={<div className="btn-group" role="group" aria-label="Importance filter">
          {[0.4, 0.6, 0.8].map(v => <button key={v} aria-pressed={minImportance === v} onClick={() => setMinImportance(v)}>{v === 0.4 ? 'All' : v === 0.6 ? 'Notable' : 'Major'}</button>)}</div>}>
          {list.length === 0 ? <div className="feed__empty">No moments have closed their evidence window yet. Start the replay.</div> : (
            <div className="stack" role="listbox" aria-label="Detected moments">{list.map(i => <InsightCard key={i.id} insight={i} dense selected={selected?.id === i.id} onSelect={ins => selectInsight(ins.id)} />)}</div>
          )}
        </Panel>
        <Panel overline="Moment inspector" title={selected ? selected.headline : 'Select a moment'}>
          {!selected ? <div className="feed__empty">Click a marker on the chart or a card on the left.</div> : (
            <div className="stack">
              <div className="row-between">
                <span className="pulse-text-caption muted">{TEAMS[selected.team].name} · {selected.kind.replace('-', ' ')} · window {String(selected.stats.window ?? '')}</span>
                <EvidenceMeter value={Math.min(5, Math.ceil(selected.event_ids.length / 3))} />
              </div>
              <div>
                <div className="pulse-overline">What happened and why it was highlighted</div>
                <p style={{ margin: '8px 0 0', color: 'var(--pulse-text-secondary)' }}>{selected.explanation}</p>
              </div>
              <div className="kv">
                {Object.entries(selected.stats).filter(([k]) => k !== 'window').map(([k, v]) => <div key={k}><span>{k.replace(/_/g, ' ')}</span><b>{typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}</b></div>)}
              </div>
              <div>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div className="pulse-overline">AI explanation</div>
                  <button className="btn btn--sm btn--primary" disabled={busy === selected.id} onClick={() => explain(selected)}>
                    <Sparkles />{busy === selected.id ? 'Generating' : explanation ? 'Regenerate' : capabilities?.ai_mode === 'foundry' ? 'Explain with Foundry' : 'Explain (demo mode)'}
                  </button>
                </div>
                {err && <ErrorState title="Explanation failed" detail={err} />}
                {explanation ? (
                  <ClaimCard text={explanation.explanation} status={explanation.verification.status} time={`${explanation.source === 'foundry' ? 'Microsoft Foundry' : 'Demo mode'} · checked by Narrative VAR`}>
                    <div className="legend" style={{ marginTop: 10 }}>
                      {explanation.verification.claims.map(c => <StatusBadge key={c.claim.id} status={c.status} label={`${c.claim.text.slice(0, 38)}${c.claim.text.length > 38 ? '…' : ''}`} />)}
                    </div>
                    {explanation.verification.corrected_text && <p style={{ margin: '10px 0 0' }} className="pulse-text-body-sm"><b>Corrected:</b> {explanation.verification.corrected_text}</p>}
                  </ClaimCard>
                ) : <p className="muted pulse-text-body-sm" style={{ margin: 0 }}>Generate a commentary-style explanation grounded in the evidence below. Every number in it is checked by Narrative VAR before it is shown.</p>}
              </div>
              <div>
                <div className="pulse-overline">Contributing events ({selected.event_ids.length})</div>
                <div className="evidence-list" style={{ marginTop: 8 }}>
                  {selected.evidence.map(ev => <div key={ev.event_id}><code>{ev.event_id}</code><em>{ev.minute}' {ev.type}</em><span>{ev.description}</span></div>)}
                  {selected.event_ids.length > selected.evidence.length && <div><code>…</code><em /><span>{selected.event_ids.length - selected.evidence.length} more events referenced by id</span></div>}
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
