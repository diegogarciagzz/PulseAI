import * as React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { PulseLoader } from '../pulse';
import type { Capabilities, EventType, MatchEvent, TeamId } from '../types/api';
import { pulseIcons, TEAMS } from '../pulse';

export function Panel({ title, overline, sub, right, children, className = '', raised = false, moment = false }:
  { title?: React.ReactNode; overline?: string; sub?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string; raised?: boolean; moment?: boolean }) {
  return (
    <section className={`pulse-card panel${raised ? ' pulse-card--raised' : ''}${moment ? ' pulse-card--moment' : ''} ${className}`}>
      {(title || overline || right) && (
        <div className="panel__head">
          <div>
            {overline && <div className="pulse-overline">{overline}</div>}
            {title && <h2 className="panel__title">{title}</h2>}
            {sub && <p className="panel__sub">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = 'Loading match data' }: { label?: string }) {
  return <div className="loading" role="status"><PulseLoader size={56} label={label} /><span>{label}</span></div>;
}

export function ErrorState({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="error-state" role="alert">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><AlertTriangle size={18} color="var(--pulse-status-unsupported)" /><b>{title}</b></div>
      {detail && <code>{detail}</code>}
      {action}
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="notice"><Info aria-hidden />{children}</div>;
}

export function ModeBadge({ caps }: { caps: Capabilities | null }) {
  if (!caps) return <span className="mode-badge" data-mode="unknown"><i />AI mode unknown</span>;
  const title = caps.ai_mode === 'foundry'
    ? `Live Microsoft Foundry inference: ${caps.foundry_model} at ${caps.foundry_endpoint_host}`
    : 'Demo mode: deterministic local outputs, no model calls. Configure Foundry in .env to enable live inference.';
  return <span className="mode-badge" data-mode={caps.ai_mode} title={title}><i />{caps.ai_mode_label}</span>;
}

export function TeamName({ team, short = false }: { team: TeamId; short?: boolean }) {
  return <>{short ? TEAMS[team].short : TEAMS[team].name}</>;
}

const ICON_FOR: Partial<Record<EventType, keyof typeof pulseIcons>> = {
  goal: 'goal', shot: 'shot', pass: 'pass', interception: 'interception', recovery: 'recovery', tackle: 'tackle',
  foul: 'foul', card: 'card', corner: 'corner', substitution: 'substitution', kickoff: 'live', halftime: 'timeline', fulltime: 'full-time',
};

export function EventIcon({ type, size = 16 }: { type: EventType; size?: number }) {
  const name = ICON_FOR[type];
  if (!name) return null;
  const Icon = pulseIcons[name];
  return <Icon size={size} />;
}

export function clock(t: number): string {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function eventText(e: MatchEvent): React.ReactNode {
  switch (e.type) {
    case 'goal': return <><b>GOAL</b> {e.player_name}{e.related_player_name ? <> (assist {e.related_player_name})</> : null} <span className="mono">{e.score_home}-{e.score_away}</span></>;
    case 'shot': return <><b>{e.player_name}</b> {e.outcome === 'on_target' ? 'shot saved' : e.outcome === 'blocked' ? 'shot blocked' : e.outcome === 'goal' ? 'scores' : 'shot off target'} <span className="muted mono">xG {e.xg?.toFixed(2)}</span></>;
    case 'pass': return <>{e.player_name} {e.outcome === 'complete' ? (e.key_pass ? <b>key pass</b> : e.progressive ? 'progressive pass' : 'pass') : <span className="muted">misplaced pass</span>} to {e.related_player_name}{e.final_third_entry && e.outcome === 'complete' ? <span className="muted"> (final third)</span> : null}</>;
    case 'carry': return <>{e.player_name} carries {e.progressive ? 'forward' : ''}{e.box_entry ? <span className="muted"> into the box</span> : null}</>;
    case 'substitution': return <><b>{e.player_name}</b> on for {e.related_player_name}</>;
    case 'card': return <><b>Yellow card</b> {e.player_name}</>;
    case 'foul': return <>{e.player_name} fouls {e.related_player_name}</>;
    case 'corner': return <>Corner, {e.team ? TEAMS[e.team].short : ''}</>;
    case 'kickoff': return <b>{e.description}</b>;
    case 'halftime': return <b>Half-time</b>;
    case 'fulltime': return <b>Full-time</b>;
    default: return <>{e.description}</>;
  }
}
