import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ClaimCard, Correction, EvidenceMeter, StatusBadge, VAR_DESCRIPTION, VerificationProgress, type VarStatus } from '../../pulse';
import { Scoreboard } from '../../components/Scoreboard';
import { ErrorState, Notice, Panel, clock } from '../../components/common';
import { api } from '../../services/api';
import { useMatch } from '../../state/MatchContext';
import type { ClaimExample, VerificationResult } from '../../types/api';

const STEP_DELAY = 260;

export function NarrativeVar() {
  const { match, replay, capabilities } = useMatch();
  const [text, setText] = React.useState('');
  const [examples, setExamples] = React.useState<ClaimExample[]>([]);
  const [result, setResult] = React.useState<VerificationResult | null>(null);
  const [step, setStep] = React.useState<number>(-1);
  const [err, setErr] = React.useState<string | null>(null);
  const [useReplayClock, setUseReplayClock] = React.useState(true);
  const [history, setHistory] = React.useState<VerificationResult[]>([]);

  React.useEffect(() => {
    if (!match) return;
    api.claimExamples(match.meta.id).then(ex => { setExamples(ex); setText(t => t || ex[1]?.text || ''); }).catch(() => setExamples([]));
  }, [match]);

  const atT = useReplayClock && replay.state.t > 0 ? replay.state.t : 5400;

  const run = async (claim?: string) => {
    if (!match) return;
    const body = (claim ?? text).trim();
    if (!body) return;
    if (claim) setText(claim);
    setErr(null); setResult(null); setStep(0);
    const timers = [1, 2, 3].map(i => window.setTimeout(() => setStep(i), i * STEP_DELAY));
    try {
      const r = await api.verify(match.meta.id, body, atT);
      await new Promise(res => setTimeout(res, STEP_DELAY * 3));
      setResult(r); setStep(4); setHistory(h => [r, ...h].slice(0, 6));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setStep(-1);
    } finally { timers.forEach(clearTimeout); }
  };

  if (!match) return null;
  const corrected = result?.claims.find(c => c.status === 'corrected' && c.corrected_text);
  return (
    <>
      <Scoreboard />
      <div className="grid-var">
        <Panel overline="Narrative VAR" title="Evidence-grounded commentary verification"
          sub="Paste or pick a line of commentary. Claims are extracted, evidence is retrieved from the match event log, numbers are checked by deterministic code, and a verdict is returned with its evidence.">
          <div className="stack">
            <textarea className="claim-input" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. North City has dominated the last ten minutes with 85% possession." aria-label="Commentary to verify" />
            <div className="row-between" style={{ flexWrap: 'wrap' }}>
              <label className="pulse-text-caption muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={useReplayClock} onChange={e => setUseReplayClock(e.target.checked)} />
                Check against events up to the replay clock ({useReplayClock && replay.state.t > 0 ? clock(replay.state.t) : 'full-time'})
              </label>
              <button className="btn btn--primary" onClick={() => run()} disabled={step >= 0 && step < 4}><ShieldCheck />Verify claim</button>
            </div>
            <div>
              <div className="pulse-overline" style={{ marginBottom: 8 }}>Try a predefined claim</div>
              <div className="examples">
                {examples.map(ex => (
                  <button key={ex.label} className="example" onClick={() => run(ex.text)}>
                    <span>{ex.text}</span><small>{ex.label}</small>
                  </button>
                ))}
              </div>
            </div>
            {capabilities?.ai_mode === 'demo' && <Notice>Numeric verification is deterministic in both modes. In Foundry mode the result can also be scored by the Foundry groundedness evaluator (see docs/evaluation.md).</Notice>}
          </div>
        </Panel>

        <Panel overline="Verdict" right={step >= 0 && <VerificationProgress step={step} />}>
          {err && <ErrorState title="Verification failed" detail={err} />}
          {!result && step < 0 && !err && (
            <div className="verdict-hero fade-in">
              <img src="/assets/narrative-var/claim-frame-empty.svg" alt="" />
              <div><div className="pulse-text-heading-md">Waiting for a claim</div><p className="muted pulse-text-body-sm" style={{ margin: '6px 0 0' }}>Six outcomes are possible: verified, corrected, unsupported, conflicted, unverified, or still checking.</p>
                <div className="legend" style={{ marginTop: 10 }}>{(['verified', 'corrected', 'unsupported', 'conflicted', 'unverified'] as VarStatus[]).map(s => <StatusBadge key={s} status={s} />)}</div></div>
            </div>
          )}
          {step >= 0 && step < 4 && (
            <ClaimCard text={text} status="checking" time={`Checked against match event data up to ${clock(atT)}`} />
          )}
          {result && (
            <div className="stack fade-in">
              <div className="verdict-hero">
                <img src={`/assets/narrative-var/stamps/${result.status}-stamp.svg`} alt={`${result.status} stamp`} />
                <div>
                  <StatusBadge status={result.status} settled />
                  <div className="pulse-text-heading-md" style={{ marginTop: 8 }}>{result.summary}</div>
                  <p className="muted pulse-text-body-sm" style={{ margin: '6px 0 0' }}>{VAR_DESCRIPTION[result.status]} Checked against match event data up to {clock(result.checked_at_t)}{result.window ? `, window ${result.window.label}` : ''}.</p>
                  <div style={{ marginTop: 8 }}><EvidenceMeter value={result.evidence_strength} /></div>
                </div>
              </div>
              {corrected && corrected.claim.value !== null && corrected.actual_label && (
                <Correction before={`${formatClaimed(corrected.claim)}`} after={corrected.actual_label} prefix={`${corrected.claim.player_name ?? teamLabel(corrected.claim.team)} · ${(corrected.claim.metric ?? '').replace(/_/g, ' ')}: `} suffix={corrected.claim.window ? ` (${corrected.claim.window.label})` : ''} />
              )}
              {result.corrected_text && (
                <div className="pulse-card" style={{ padding: 16, boxShadow: 'inset 0 0 0 1px var(--pulse-status-corrected-border)' }}>
                  <div className="pulse-overline" style={{ color: 'var(--pulse-status-corrected)' }}>Revised commentary</div>
                  <p style={{ margin: '8px 0 0' }}>{result.corrected_text}</p>
                </div>
              )}
              <div className="claim-list">
                {result.claims.map(c => (
                  <div className="claim-row" key={c.claim.id}>
                    <div className="row-between"><span className="pulse-text-caption muted mono">{c.claim.id} · {c.claim.kind}{c.claim.metric ? ` · ${c.claim.metric.replace(/_/g, ' ')}` : ''}</span><StatusBadge status={c.status} /></div>
                    <p>{c.claim.fragment ? <>{c.claim.text} <span className="muted">· checking “{c.claim.fragment}”</span></> : c.claim.text}</p>
                    <p className="muted pulse-text-body-sm">{c.reasoning}</p>
                    {Object.keys(c.alternative_readings).length > 0 && (
                      <div className="kv">{Object.entries(c.alternative_readings).map(([k, v]) => <div key={k}><span>{k}</span><b>{typeof v === 'number' ? v.toFixed(1) : v}</b></div>)}</div>
                    )}
                    {c.evidence.length > 0 && (
                      <details>
                        <summary className="pulse-text-caption muted" style={{ cursor: 'pointer' }}>Evidence: {c.evidence.length} event{c.evidence.length === 1 ? '' : 's'} referenced</summary>
                        <div className="evidence-list" style={{ marginTop: 8 }}>{c.evidence.map(e => <div key={e.event_id}><code>{e.event_id}</code><em>{e.minute}' {e.type}</em><span>{e.description}</span></div>)}</div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              {result.groundedness && (
                <div className="claim-row"><div className="pulse-overline">Foundry groundedness evaluator</div><pre className="audit">{JSON.stringify(result.groundedness, null, 2)}</pre></div>
              )}
              <details>
                <summary className="pulse-text-caption muted" style={{ cursor: 'pointer' }}>Audit trail · {result.id} · {result.ai_mode}</summary>
                <pre className="audit">{JSON.stringify(result.audit, null, 2)}</pre>
              </details>
            </div>
          )}
        </Panel>
      </div>
      {history.length > 1 && (
        <Panel overline="Recent checks">
          <div className="legend">{history.map(h => <span key={h.id}><StatusBadge status={h.status} /> <span className="muted">{h.original_text.slice(0, 60)}{h.original_text.length > 60 ? '…' : ''}</span></span>)}</div>
        </Panel>
      )}
    </>
  );
}

function teamLabel(team: string | null): string {
  return team === 'north-city' ? 'North City FC' : team === 'south-united' ? 'South United FC' : 'Match';
}

function formatClaimed(c: VerificationResult['claims'][number]['claim']): string {
  if (c.value === null) return c.text;
  if (c.unit === '%') return `${c.value}%`;
  if (c.unit === 'xg') return `${c.value} xG`;
  return String(c.value);
}
