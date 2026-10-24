// Live indicator, match clock, score with change animation, team badge, pundit card.
import * as React from 'react';

export function LiveIndicator({ label = 'Live' }: { label?: string }) {
  return <span className="pulse-live" role="status"><span className="pulse-live__dot" aria-hidden />{label}</span>;
}

/** Match clock. Pass seconds since kick-off of the current period window. */
export function MatchClock({ seconds, added, period }: { seconds: number; added?: number; period?: '1H' | 'HT' | '2H' | 'ET' | 'FT' }) {
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return (
    <span className="pulse-clock" aria-label={`Match clock ${m} minutes ${s} seconds`}>
      {period && <span className="pulse-clock__period">{period}</span>}
      <span>{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</span>
      {added ? <span className="pulse-clock__added">+{added}</span> : null}
    </span>
  );
}

/** Ring clock (0 to 90 minutes) for compact headers. */
export function MatchClockRing({ minute, size = 64 }: { minute: number; size?: number }) {
  const r = size / 2 - 6, c = size / 2, a = ((Math.min(minute, 90) * 4 - 90) * Math.PI) / 180;
  const ex = c + r * Math.cos(a), ey = c + r * Math.sin(a), large = minute * 4 > 180 ? 1 : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${minute} minutes played`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1F3249" strokeWidth={4} />
      {minute > 0 && <path d={`M${c} ${c - r}A${r} ${r} 0 ${large} 1 ${ex} ${ey}`} fill="none" stroke="#35E0ED" strokeWidth={4} strokeLinecap="round" />}
      <circle cx={ex} cy={ey} r={3.5} fill="#BCFF47" stroke="#07111F" strokeWidth={1.5} />
      <text x={c} y={c + 4} textAnchor="middle" fill="#F4F7FB" fontFamily="IBM Plex Mono, monospace" fontWeight={600} fontSize={size * 0.2}>{minute}'</text>
    </svg>
  );
}

/** Score digit that plays a short tick animation when the value changes. */
export function Score({ value }: { value: number }) {
  const [key, setKey] = React.useState(0);
  const prev = React.useRef(value);
  React.useEffect(() => { if (prev.current !== value) { setKey(k => k + 1); prev.current = value; } }, [value]);
  return <span key={key} className={`pulse-score${key ? ' pulse-score--changed' : ''}`}>{value}</span>;
}

export type TeamId = 'north-city' | 'south-united';
export const TEAMS: Record<TeamId, { name: string; short: string; badge: string; badgeSmall: string; avatar: string; color: string }> = {
  'north-city': { name: 'North City FC', short: 'NCF', badge: '/assets/teams/north-city/north-city-badge.svg', badgeSmall: '/assets/teams/north-city/north-city-badge-small.svg', avatar: '/assets/teams/north-city/north-city-avatar.svg', color: '#27B8F5' },
  'south-united': { name: 'South United FC', short: 'SUF', badge: '/assets/teams/south-united/south-united-badge.svg', badgeSmall: '/assets/teams/south-united/south-united-badge-small.svg', avatar: '/assets/teams/south-united/south-united-avatar.svg', color: '#FF5B2E' },
};

/** Badge with automatic small variant below 40px. */
export function TeamBadge({ team, size = 32 }: { team: TeamId; size?: number }) {
  const t = TEAMS[team];
  return <img src={size < 40 ? t.badgeSmall : t.badge} alt={t.name} height={size} style={{ height: size, width: 'auto' }} />;
}

export type PunditId = 'analyst' | 'fan' | 'tactician';
export const PUNDITS: Record<PunditId, { name: string; role: string; portrait: string; avatar: string; thumb: string; icon: string; accent: string }> = {
  analyst: { name: 'Alex Mercer', role: 'The Analyst', portrait: '/assets/pundits/analyst/png/alex-mercer-portrait-1024.png', avatar: '/assets/pundits/analyst/png/alex-mercer-avatar-256.png', thumb: '/assets/pundits/analyst/png/alex-mercer-thumb-128.png', icon: '/assets/pundits/analyst/alex-mercer-icon.svg', accent: '#4CC9FF' },
  fan: { name: 'Mateo Reyes', role: 'The Fan', portrait: '/assets/pundits/fan/png/mateo-reyes-portrait-1024.png', avatar: '/assets/pundits/fan/png/mateo-reyes-avatar-256.png', thumb: '/assets/pundits/fan/png/mateo-reyes-thumb-128.png', icon: '/assets/pundits/fan/mateo-reyes-icon.svg', accent: '#BCFF47' },
  tactician: { name: 'Sofia Hart', role: 'The Tactician', portrait: '/assets/pundits/tactician/png/sofia-hart-portrait-1024.png', avatar: '/assets/pundits/tactician/png/sofia-hart-avatar-256.png', thumb: '/assets/pundits/tactician/png/sofia-hart-thumb-128.png', icon: '/assets/pundits/tactician/sofia-hart-icon.svg', accent: '#A08CFF' },
};

/** Pundit card for the Roundtable. Add speaking to highlight the active agent. */
export function PunditCard({ pundit, pick, children, speaking }: { pundit: PunditId; pick?: string; children?: React.ReactNode; speaking?: boolean }) {
  const p = PUNDITS[pundit];
  return (
    <article className={`pulse-pundit${speaking ? ' pulse-pundit--speaking' : ''}`} data-pundit={pundit} aria-current={speaking || undefined}>
      <div className="pulse-pundit__bar" />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '18px 20px 0' }}>
        <img src={p.avatar} alt="" width={88} height={88} style={{ borderRadius: '50%' }} />
        <div>
          <div className="pulse-pundit__role">{p.role}</div>
          <div className="pulse-pundit__name">{p.name}</div>
          {pick && <div style={{ marginTop: 6, color: 'var(--pulse-text-secondary)' }}>Pick: <b style={{ color: 'var(--pulse-text)' }}>{pick}</b></div>}
        </div>
      </div>
      <div style={{ padding: '14px 20px 20px', color: 'var(--pulse-text-secondary)' }}>{children}</div>
    </article>
  );
}
