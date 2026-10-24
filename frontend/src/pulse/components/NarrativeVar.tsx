// Narrative VAR UI primitives. Status is always shown as icon + label (never colour alone).
import * as React from 'react';
import { pulseIcons } from './icons';

export type VarStatus = 'verified' | 'corrected' | 'unsupported' | 'conflicted' | 'unverified' | 'checking';

export const VAR_LABEL: Record<VarStatus, string> = {
  verified: 'Verified', corrected: 'Corrected', unsupported: 'Unsupported',
  conflicted: 'Conflicted', unverified: 'Unverified', checking: 'Checking',
};

export const VAR_DESCRIPTION: Record<VarStatus, string> = {
  verified: 'The claim matches the match evidence.',
  corrected: 'Close, but a figure was wrong. A correction is proposed.',
  unsupported: 'The evidence contradicts the claim.',
  conflicted: 'Sources disagree. Both readings are shown.',
  unverified: 'Outside the data we hold, so it is not judged.',
  checking: 'Evidence is being gathered.',
};

/** Compact chip. Uses .pulse-status from pulse-theme.css. */
export function StatusBadge({ status, label, settled }: { status: VarStatus; label?: string; settled?: boolean }) {
  const Icon = pulseIcons[`status-${status}` as const];
  return (
    <span className={`pulse-status${settled ? ' pulse-status--settled' : ''}`} data-status={status} title={VAR_DESCRIPTION[status]}>
      <Icon size={16} aria-hidden />
      {label ?? VAR_LABEL[status]}
    </span>
  );
}

/** Evidence strength meter (0..max bars) + count. */
export function EvidenceMeter({ value, max = 5, label }: { value: number; max?: number; label?: string }) {
  return (
    <span className="pulse-evidence" aria-label={`Evidence ${value} of ${max}`}>
      <span className="pulse-evidence__bars">{Array.from({ length: max }, (_, i) => <i key={i} data-on={i < value ? '' : undefined} />)}</span>
      {label ?? `Evidence ${value}/${max}`}
    </span>
  );
}

const STEPS = ['Claim', 'Evidence', 'Cross-check', 'Verdict'] as const;

/** 4-step verification progress. step = index of the active step (4 = complete). */
export function VerificationProgress({ step }: { step: number }) {
  return (
    <div>
      <div className="pulse-var-progress" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step} aria-valuetext={STEPS[Math.min(step, 3)]}>
        {STEPS.map((s, i) => <span key={s} data-state={i < step ? 'done' : i === step ? 'active' : 'todo'} />)}
      </div>
    </div>
  );
}

/** A claim under inspection: corner brackets + scan sweep while checking. */
export function ClaimCard({ text, status, time, children }: { text: React.ReactNode; status: VarStatus; time?: string; children?: React.ReactNode }) {
  return (
    <div className="pulse-claim" data-scanning={status === 'checking' ? 'true' : undefined}
      style={{ ['--_bc' as any]: `var(--pulse-status-${status})` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        {time && <span className="pulse-text-label-mono" style={{ color: 'var(--pulse-text-muted)' }}>{time}</span>}
        <StatusBadge status={status} />
      </div>
      <p style={{ margin: '10px 0 0' }}>{text}</p>
      {children}
    </div>
  );
}

/** Before / after correction. Pass the wrong and the corrected fragment. */
export function Correction({ before, after, prefix, suffix }: { before: string; after: string; prefix?: string; suffix?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' }}>
      <div className="pulse-card" style={{ padding: 16 }}>
        <div className="pulse-text-label-mono" style={{ color: 'var(--pulse-text-muted)' }}>Before</div>
        <p>{prefix}<span className="pulse-claim__strike">{before}</span>{suffix}</p>
      </div>
      <div aria-hidden style={{ display: 'grid', placeItems: 'center', color: 'var(--pulse-status-corrected)' }}>&#8594;</div>
      <div className="pulse-card" style={{ padding: 16, boxShadow: 'inset 0 0 0 1px var(--pulse-status-corrected-border)' }}>
        <div className="pulse-text-label-mono" style={{ color: 'var(--pulse-status-corrected)' }}>After</div>
        <p>{prefix}<span className="pulse-claim__fix">{after}</span>{suffix}</p>
      </div>
    </div>
  );
}
