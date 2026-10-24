// PULSE AI broadcast overlays as React components (1920 x 1080 stage).
// Styles: src/theme/pulse-theme.css + src/broadcast/pulse-broadcast.css.
// All text, scores, clocks and metrics are props. Nothing is baked into images.
import * as React from 'react';
import { TEAMS, type TeamId, PUNDITS, type PunditId } from '../components/MatchChrome';
import type { VarStatus } from '../components/NarrativeVar';

const A = '/assets';

/** Scales the 1920 x 1080 stage to its container. Put overlays inside. */
export function BroadcastStage({ children, background }: { children: React.ReactNode; background?: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1920));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden' }}>
      <div className="pb-stage" style={{ ['--pb-scale' as any]: scale }}>
        {background}
        {children}
      </div>
    </div>
  );
}

const Safe = ({ children }: { children: React.ReactNode }) => <div className="pb-safe">{children}</div>;

export function ScoreBug({ home, away, homeScore, awayScore, clock, added, live = true }:
  { home: TeamId; away: TeamId; homeScore: number; awayScore: number; clock: string; added?: number; live?: boolean }) {
  const h = TEAMS[home], a = TEAMS[away];
  return (
    <Safe><div className="pb-scorebug pb-plate pb-enter-wipe" role="group" aria-label={`${h.name} ${homeScore}, ${a.name} ${awayScore}, ${clock}`}>
      <div className="pb-scorebug__mark"><img src={`${A}/brand/logos/pulse-ai-symbol.svg`} alt="PULSE AI" /></div>
      <div className="pb-scorebug__team" style={{ ['--_team' as any]: h.color }}><img src={h.badgeSmall} alt="" /><span className="pb-scorebug__abbr">{h.short}</span></div>
      <div className="pb-scorebug__score"><span className="pulse-score">{homeScore}</span><i /><span className="pulse-score">{awayScore}</span></div>
      <div className="pb-scorebug__team" style={{ ['--_team' as any]: a.color }}><span className="pb-scorebug__abbr">{a.short}</span><img src={a.badgeSmall} alt="" /></div>
      <div className="pb-scorebug__clock">{live && <span className="pb-live-dot" />}<span className="pb-num">{clock}</span>{added ? <span className="pb-scorebug__added">+{added}</span> : null}</div>
    </div></Safe>
  );
}

export function GoalAnnouncement({ team, scorer, minute, assist, note, score, teams = ['north-city', 'south-united'] }:
  { team: TeamId; scorer: string; minute: number; assist?: string; note?: string; score: [number, number]; teams?: [TeamId, TeamId] }) {
  const t = TEAMS[team];
  return (
    <Safe><div className="pb-goal pb-enter-goal" role="alert">
      <div className="pb-goal__band"><span className="pb-goal__word">GOAL</span></div>
      <div className="pb-goal__info pb-plate">
        <img src={t.badge} alt={t.name} />
        <div>
          <div className="pb-goal__minute">{minute}'  {t.name.toUpperCase()}</div>
          <div className="pb-goal__scorer">{scorer}</div>
          {(assist || note) && <div className="pb-goal__sub">{assist && <>Assist <b>{assist}</b></>}{assist && note ? '  ·  ' : ''}{note}</div>}
        </div>
        <div className="pb-goal__score pb-num">{score[0]} : {score[1]}<small>{TEAMS[teams[0]].short}  ·  {TEAMS[teams[1]].short}</small></div>
      </div>
    </div></Safe>
  );
}

export function MomentumToast({ team, window, delta, metric = 'Pressure index', deltaLabel = 'LAST 10 MIN', children }:
  { team: TeamId; window: string; delta: string; metric?: string; deltaLabel?: string; children?: React.ReactNode }) {
  const t = TEAMS[team];
  return (
    <Safe><div className="pb-momentum pb-plate pb-enter-rise" style={{ ['--_team' as any]: t.color }} role="status">
      <div className="pb-momentum__head"><span className="pb-overline">Momentum shift</span><span className="pb-momentum__time">{window}</span></div>
      <div className="pb-momentum__body"><img src={t.badgeSmall} alt="" />
        <div><div className="pb-momentum__team">{t.name.replace(' FC', '')}</div><div className="pb-player__role" style={{ marginTop: 8 }}>{metric}</div></div>
        <div className="pb-momentum__delta pb-num">{delta}<small>{deltaLabel}</small></div></div>
      {children /* pass a mini <svg className="pb-momentum__wave"> sparkline */}
      <div className="pb-momentum__bar" />
    </div></Safe>
  );
}

export function PlayerStatCard({ team, number, name, role, stats, footnote }:
  { team: TeamId; number: number; name: string; role: string; stats: { label: string; value: string; pct: number }[]; footnote?: string }) {
  const t = TEAMS[team];
  return (
    <Safe><div className="pb-player pb-plate pb-enter-rise" style={{ ['--_team' as any]: t.color }}>
      <div className="pb-player__head"><div className="pb-player__no">{number}</div><div><div className="pb-player__name">{name}</div><div className="pb-player__role">{role}</div></div><img src={t.badgeSmall} alt="" /></div>
      <div className="pb-player__stats">{stats.map(s => (
        <div className="pb-stat" key={s.label}><span className="pb-stat__label">{s.label}</span><span className="pb-stat__value">{s.value}</span><div className="pb-stat__bar"><i style={{ ['--v' as any]: `${s.pct}%` }} /></div></div>
      ))}</div>
      {footnote && <div className="pb-player__foot">{footnote}</div>}
    </div></Safe>
  );
}

export function VarBanner({ status, quote, source, evidence = 4 }:
  { status: VarStatus; quote: React.ReactNode; source: React.ReactNode; evidence?: number }) {
  return (
    <Safe><div className="pb-var pb-plate pb-enter-wipe" role="status">
      <div className="pb-var__status" data-status={status}><img src={`${A}/icons/verification/${status}-color.svg`} alt="" />
        <span className="pb-var__label">{status.toUpperCase()}</span><span className="pb-var__kicker">NARRATIVE VAR</span></div>
      <div className="pb-var__claim"><div className="pb-var__quote">{quote}</div><div className="pb-var__source">{source}</div></div>
      <div className="pb-var__evidence"><div className="pb-var__meter">{[0, 1, 2, 3, 4].map(i => <i key={i} data-on={i < evidence ? '' : undefined} />)}</div>
        <span className="pb-var__count">EVIDENCE {evidence}/5</span></div>
    </div></Safe>
  );
}

export function InsightLowerThird({ text, verified = true, evidenceLabel, meta }:
  { text: React.ReactNode; verified?: boolean; evidenceLabel?: string; meta?: string }) {
  return (
    <Safe><div className="pb-insight pb-plate pb-enter-wipe">
      <div className="pb-insight__bar" />
      <div className="pb-insight__body">
        <div className="pb-insight__head"><span className="pb-overline">PULSE AI Insight</span>
          {verified && <span className="pb-chip pb-chip--verified"><img src={`${A}/icons/verification/verified-color.svg`} alt="" />Verified</span>}</div>
        <div className="pb-insight__text">{text}</div>
        {(evidenceLabel || meta) && <div className="pb-insight__foot">{evidenceLabel && <span className="pb-chip pb-chip--evidence">{evidenceLabel}</span>}<span>{meta}</span></div>}
      </div>
    </div></Safe>
  );
}

export function PunditNameplate({ pundit, take }: { pundit: PunditId; take?: string }) {
  const p = PUNDITS[pundit];
  return (
    <Safe><div className="pb-pundit pb-enter-wipe" data-pundit={pundit}>
      <img className="pb-pundit__avatar" src={p.avatar} alt="" />
      <div className="pb-pundit__plate pb-plate"><div className="pb-pundit__name">{p.name}</div>
        <div className="pb-pundit__role"><img src={p.icon} alt="" />{p.role}</div>
        {take && <div className="pb-pundit__take">{take}</div>}</div>
    </div></Safe>
  );
}

export function PlayerOfTheMatch({ team, name, number, rating, stats, votes, shirt }:
  { team: TeamId; name: string; number: number; rating: string; stats: { label: string; value: string }[]; votes: { pundit: PunditId; agrees: boolean }[]; shirt?: string }) {
  const t = TEAMS[team];
  const [first, ...rest] = name.split(' ');
  return (
    <div className="pb-potm pb-enter-rise"><div className="pb-potm__card pb-plate">
      <div className="pb-potm__top"><span className="pb-overline">Player of the Match</span><span style={{ font: '600 18px/1 var(--pulse-font-mono)' }}>AI ROUNDTABLE VERDICT</span></div>
      <div className="pb-potm__hero"><img className="pb-potm__shirt" src={shirt ?? `${A}/teams/${team}/${team}-jersey-home.svg`} alt="" />
        <div><div className="pb-potm__name">{first}<br />{rest.join(' ')}</div><div className="pb-potm__team"><img src={t.badgeSmall} alt="" />{t.name}  ·  #{number}</div>
          <div className="pb-potm__rating"><b>{rating}</b><span>PULSE RATING</span></div></div></div>
      <div className="pb-potm__stats">{stats.map(s => <div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}</div>
      <div className="pb-potm__votes">{votes.map(v => <img key={v.pundit} className={v.agrees ? '' : 'pb-vote-x'} src={PUNDITS[v.pundit].thumb} alt={PUNDITS[v.pundit].name} />)}
        <span><b style={{ color: 'var(--pulse-text)' }}>{votes.filter(v => v.agrees).length} of {votes.length} pundits</b> agree</span></div>
    </div></div>
  );
}

export function TitleCard({ kicker, word, accentWord, home, away, score, footer, children, tone = 'cyan' }:
  { kicker: string; word: string; accentWord: string; home: TeamId; away: TeamId; score: [number, number]; footer?: string; children?: React.ReactNode; tone?: 'cyan' | 'lime' }) {
  const h = TEAMS[home], a = TEAMS[away];
  const c = tone === 'lime' ? 'var(--pulse-brand-lime)' : 'var(--pulse-accent)';
  return (
    <div className="pb-title pb-enter-rise">
      <div className="pb-title__kicker"><span className="pb-overline" style={{ fontSize: 22, color: c }}>{kicker}</span></div>
      <div className="pb-title__word">{word}<em style={{ color: c }}>{accentWord}</em></div>
      <div className="pb-title__score"><img src={h.badge} alt="" />{h.name.replace(' FC', '')} <b>{score[0]} : {score[1]}</b> {a.name.replace(' FC', '')}<img src={a.badge} alt="" /></div>
      {children}
      <div className="pb-title__foot"><img src={`${A}/brand/logos/pulse-ai-logo-horizontal.svg`} alt="PULSE AI" />{footer ?? 'BEYOND THE SCORELINE'}</div>
    </div>
  );
}

export function MatchPulseFrame({ children, homeLabel = 'NCF', awayLabel = 'SUF' }: { children: React.ReactNode; homeLabel?: string; awayLabel?: string }) {
  return (
    <Safe><div className="pb-pulse pb-plate pb-enter-rise">
      <div className="pb-pulse__head"><span className="pb-overline"><span className="pb-live-dot" />Match Pulse</span>
        <div className="pb-pulse__legend"><span style={{ ['--_c' as any]: 'var(--pulse-chart-momentum-home)' }}><i />{homeLabel}</span><span style={{ ['--_c' as any]: 'var(--pulse-chart-momentum-away)' }}><i />{awayLabel}</span></div></div>
      {children /* e.g. <MatchPulseChart height={190} ... /> */}
      <div className="pb-pulse__axis"><span>0'</span><span>15'</span><span>30'</span><span>HT</span><span>60'</span><span>75'</span><span>90'</span></div>
    </div></Safe>
  );
}
