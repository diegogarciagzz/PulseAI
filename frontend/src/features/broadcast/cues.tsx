// On-air graphics for the Broadcast view. Each cue renders one kit overlay from live
// match data; nothing here is hard-coded sample text.
import * as React from 'react';
import {
  GoalAnnouncement, InsightLowerThird, MomentumToast, PlayerOfTheMatch, PlayerStatCard, PunditNameplate, TEAMS, TitleCard, VarBanner,
} from '../../pulse';
import { FULL_T, HALF_T } from '../../hooks/useReplay';
import { api } from '../../services/api';
import type {
  DebateResult, InsightExplanation, MatchEvent, MomentumInsight, PlayerStats, PulsePoint, TeamId, TeamStats, VerificationResult,
} from '../../types/api';
import { scoreAt, type Cue } from './director';

const A = '/assets';

export interface OnAirContext {
  matchId: string;
  home: TeamId;
  away: TeamId;
  events: MatchEvent[];
  pulse: PulsePoint[];
  insights: MomentumInsight[];
  debate: DebateResult | null;
  aiMode: 'demo' | 'foundry';
  /** Shared in-flight requests, so a graphic that airs twice does not call the model twice. */
  requests: Map<string, Promise<unknown>>;
}

export function OnAir({ cue, ctx }: { cue: Cue; ctx: OnAirContext }) {
  switch (cue.kind) {
    case 'goal': return cue.event ? <GoalCue e={cue.event} ctx={ctx} /> : null;
    case 'player': return <PlayerCue cue={cue} ctx={ctx} />;
    case 'momentum': return cue.insight ? <MomentumCue i={cue.insight} ctx={ctx} /> : null;
    case 'insight': return cue.insight ? <InsightCue i={cue.insight} /> : null;
    case 'ai-insight': return cue.insight ? <AiInsightCue i={cue.insight} ctx={ctx} /> : null;
    case 'var': return cue.claim ? <VarCue claim={cue.claim} at={cue.at} ctx={ctx} /> : null;
    case 'pundit': return ctx.debate && cue.pundit ? <PunditCue cue={cue} debate={ctx.debate} /> : null;
    case 'potm': return ctx.debate ? <PotmCue debate={ctx.debate} /> : null;
    case 'halftime': return <HalftimeCue ctx={ctx} />;
    case 'fulltime': return <FulltimeCue ctx={ctx} />;
  }
}

/** Shares one request per key between every graphic that needs it. */
function useShared<T>(ctx: OnAirContext, name: string, load: () => Promise<T>): { data: T | null; failed: boolean } {
  const key = `${ctx.matchId}|${name}`;
  const [state, setState] = React.useState<{ key: string; data: T | null; failed: boolean }>({ key, data: null, failed: false });
  React.useEffect(() => {
    let off = false;
    let p = ctx.requests.get(key) as Promise<T> | undefined;
    if (!p) {
      p = load();
      ctx.requests.set(key, p);
      p.catch(() => ctx.requests.delete(key));
    }
    p.then(data => { if (!off) setState({ key, data, failed: false }); }).catch(() => { if (!off) setState({ key, data: null, failed: true }); });
    return () => { off = true; };
    // `load` is recreated on every render; the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.requests, key]);
  return state.key === key ? { data: state.data, failed: state.failed } : { data: null, failed: false };
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const surname = (name: string | null | undefined) => (name ?? '').split(' ').slice(-1)[0];

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > max * 0.3) return cut.slice(0, stop + 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    d += `C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** Match Pulse line for the broadcast frame: 0' to 90' across 640 x 190, real data up to the clock. */
export function PulseMini({ pulse, goals, home }: { pulse: PulsePoint[]; goals: MatchEvent[]; home: TeamId }) {
  const id = React.useId().replace(/:/g, '');
  const W = 640, H = 190, base = H / 2, amp = H * 0.42;
  const X = (sec: number) => (sec / FULL_T) * W;
  const Y = (v: number) => base - Math.max(-1, Math.min(1, v)) * amp;
  const pts = pulse.map(p => [X(p.t), Y(p.value)] as [number, number]);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1];
  const area = last ? `${d}L${last[0].toFixed(1)} ${base}L0 ${base}Z` : '';
  const valueAt = (sec: number) => {
    let best = pulse[0];
    for (const p of pulse) if (Math.abs(p.t - sec) < Math.abs((best?.t ?? 0) - sec)) best = p;
    return best?.value ?? 0;
  };
  const hc = 'var(--pulse-chart-momentum-home, #27B8F5)', ac = 'var(--pulse-chart-momentum-away, #FF6B3D)';
  return (
    <svg className="pb-pulse__chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Match Pulse momentum so far">
      <defs>
        <linearGradient id={`${id}-h`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={base}><stop offset="0" stopColor={hc} stopOpacity={0.7} /><stop offset="1" stopColor={hc} stopOpacity={0.04} /></linearGradient>
        <linearGradient id={`${id}-a`} gradientUnits="userSpaceOnUse" x1="0" y1={base} x2="0" y2={H}><stop offset="0" stopColor={ac} stopOpacity={0.04} /><stop offset="1" stopColor={ac} stopOpacity={0.7} /></linearGradient>
        <clipPath id={`${id}-t`}><rect width={W} height={base} /></clipPath>
        <clipPath id={`${id}-b`}><rect y={base} width={W} height={base} /></clipPath>
      </defs>
      {[15, 30, 45, 60, 75].map(m => <path key={m} d={`M${X(m * 60).toFixed(1)} 0V${H}`} stroke="#90A3B8" strokeOpacity={m === 45 ? 0.22 : 0.08} />)}
      <path d={area} fill={`url(#${id}-h)`} clipPath={`url(#${id}-t)`} />
      <path d={area} fill={`url(#${id}-a)`} clipPath={`url(#${id}-b)`} />
      <path d={`M0 ${base}H${W}`} stroke="#F4F7FB" strokeOpacity={0.35} strokeDasharray="2 5" />
      <path d={d} fill="none" stroke="#F4F7FB" strokeWidth={2.5} strokeLinejoin="round" />
      {goals.map(g => (
        <circle key={g.id} cx={X(g.t)} cy={Y(valueAt(g.t))} r={7} fill="#BCFF47" stroke={g.team === home ? '#27B8F5' : '#FF6B3D'} strokeWidth={2.5} />
      ))}
      {last && <><circle cx={last[0]} cy={last[1]} r={12} fill="#35E0ED" fillOpacity={0.2} /><circle cx={last[0]} cy={last[1]} r={5.5} fill="#35E0ED" /></>}
    </svg>
  );
}

/** Momentum sparkline for the toast, oriented so "up" is the highlighted team. */
function TeamWave({ pulse, from, to, highlightFrom, sign, color }: { pulse: PulsePoint[]; from: number; to: number; highlightFrom: number; sign: 1 | -1; color: string }) {
  const id = React.useId().replace(/:/g, '');
  const W = 520, H = 84;
  const pts = pulse.filter(p => p.t >= from && p.t <= to);
  if (pts.length < 2) return null;
  const X = (sec: number) => ((sec - from) / Math.max(1, to - from)) * W;
  const Y = (v: number) => H * 0.55 - Math.max(-1, Math.min(1, v * sign)) * H * 0.42;
  const d = smoothPath(pts.map(p => [X(p.t), Y(p.value)]));
  const hx = Math.max(0, Math.min(W, X(highlightFrom)));
  return (
    <svg className="pb-momentum__wave" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.45} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient>
        <clipPath id={`${id}-c`}><rect x={hx} width={W - hx} height={H} /></clipPath>
      </defs>
      <rect x={hx} width={W - hx} height={H} fill={color} fillOpacity={0.08} />
      <path d={`${d}L${W} ${H}L0 ${H}Z`} fill={`url(#${id}-g)`} clipPath={`url(#${id}-c)`} />
      <path d={d} fill="none" stroke="#B7C5D4" strokeOpacity={0.5} strokeWidth={2} />
      <path d={d} fill="none" stroke={color} strokeWidth={3} clipPath={`url(#${id}-c)`} />
      <path d={`M${hx} 0V${H}`} stroke={color} strokeDasharray="3 4" />
    </svg>
  );
}

/** First-half (or full-match) pulse drawn across the title card. */
function TitleWave({ pulse, until }: { pulse: PulsePoint[]; until: number }) {
  const id = React.useId().replace(/:/g, '');
  const W = 1920, H = 200;
  const pts = pulse.filter(p => p.t <= until).map(p => [(p.t / until) * W, H / 2 - Math.max(-1, Math.min(1, p.value)) * H * 0.4] as [number, number]);
  if (pts.length < 2) return null;
  const d = smoothPath(pts);
  return (
    <svg className="pb-title__wave" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={`${id}-f`} x1="0" x2="1">
        <stop offset="0" stopColor="#35E0ED" stopOpacity={0} /><stop offset="0.2" stopColor="#35E0ED" stopOpacity={0.9} />
        <stop offset="0.8" stopColor="#35E0ED" stopOpacity={0.9} /><stop offset="1" stopColor="#35E0ED" stopOpacity={0} />
      </linearGradient></defs>
      <path d={d} fill="none" stroke={`url(#${id}-f)`} strokeWidth={2.5} />
      <path d={d} fill="none" stroke={`url(#${id}-f)`} strokeWidth={10} strokeOpacity={0.12} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Cues                                                                 */
/* ------------------------------------------------------------------ */
function GoalCue({ e, ctx }: { e: MatchEvent; ctx: OnAirContext }) {
  const build = ctx.insights.find(i => i.kind === 'goal-buildup' && i.t === e.t);
  const note = build ? `${num(build.stats.passes_in_move)}-pass move  ·  xG ${num(build.stats.xg).toFixed(2)}` : e.xg !== null ? `xG ${e.xg.toFixed(2)}` : undefined;
  return (
    <GoalAnnouncement team={e.team ?? ctx.home} scorer={e.player_name ?? 'Goal'} minute={e.minute} assist={e.related_player_name ?? undefined}
      note={note} score={[e.score_home, e.score_away]} teams={[ctx.home, ctx.away]} />
  );
}

function PlayerCue({ cue, ctx }: { cue: Cue; ctx: OnAirContext }) {
  const { data: rows } = useShared(ctx, `players@${cue.at}`, () => api.players(ctx.matchId, cue.at));
  if (!rows) return null;
  const p = rows.find(r => r.player_id === cue.playerId) ?? rows.find(r => r.name === cue.playerName);
  if (!p) return null;
  const max = (k: keyof PlayerStats) => Math.max(1e-9, ...rows.map(r => num(r[k])));
  const bar = (k: keyof PlayerStats) => Math.round(Math.min(100, (num(p[k]) / max(k)) * 100));
  const attacking = p.goals > 0 || p.position === 'FW';
  const defending = p.position === 'DF' || p.position === 'GK';
  const stats = attacking ? [
    { label: 'Goals', value: String(p.goals), pct: bar('goals') },
    { label: 'Shots on target', value: `${p.shots_on_target} / ${p.shots}`, pct: bar('shots') },
    { label: 'Expected goals (xG)', value: p.xg.toFixed(2), pct: bar('xg') },
    { label: 'Touches', value: String(p.touches), pct: bar('touches') },
  ] : defending ? [
    { label: 'Recoveries', value: String(p.recoveries), pct: bar('recoveries') },
    { label: 'Tackles + interceptions', value: String(p.tackles + p.interceptions), pct: bar('defensive_actions') },
    { label: 'Passes completed', value: String(p.passes_completed), pct: bar('passes_completed') },
    { label: 'Pass accuracy', value: `${Math.round(p.pass_accuracy)}%`, pct: Math.round(p.pass_accuracy) },
  ] : [
    { label: 'Passes completed', value: String(p.passes_completed), pct: bar('passes_completed') },
    { label: 'Progressive passes', value: String(p.progressive_passes), pct: bar('progressive_passes') },
    { label: 'Key passes', value: String(p.key_passes), pct: bar('key_passes') },
    { label: 'Pass accuracy', value: `${Math.round(p.pass_accuracy)}%`, pct: Math.round(p.pass_accuracy) },
  ];
  return <PlayerStatCard team={p.team} number={p.number} name={p.name} role={p.role} stats={stats}
    footnote={`Up to ${Math.floor(cue.at / 60)}'  ·  bars relative to the match leader`} />;
}

function MomentumCue({ i, ctx }: { i: MomentumInsight; ctx: OnAirContext }) {
  const sign: 1 | -1 = i.team === ctx.home ? 1 : -1;
  const window = typeof i.stats.window === 'string' ? i.stats.window : `${Math.floor(i.window_start_t / 60)}'  to  ${Math.floor(i.window_end_t / 60)}'`;
  let metric = 'Match Pulse', delta = '', deltaLabel = '';
  if (i.kind === 'momentum-swing') {
    const shift = (num(i.stats.pulse_after) - num(i.stats.pulse_before)) * sign;
    metric = 'Match Pulse swing'; delta = `${shift >= 0 ? '+' : ''}${shift.toFixed(2)}`; deltaLabel = 'PULSE SHIFT';
  } else if (i.kind === 'pressure-surge') {
    metric = 'Pressure spell'; delta = String(num(i.stats.shots)); deltaLabel = `SHOTS IN ${num(i.stats.duration_min)} MIN`;
  } else {
    const shift = num(i.stats.momentum_after) - num(i.stats.momentum_before);
    metric = 'Substitution impact'; delta = `${shift >= 0 ? '+' : ''}${shift.toFixed(2)}`; deltaLabel = 'PULSE AFTER CHANGE';
  }
  const from = Math.max(0, i.window_start_t - 600);
  return (
    <MomentumToast team={i.team} window={window} metric={metric} delta={delta} deltaLabel={deltaLabel}>
      <TeamWave pulse={ctx.pulse} from={from} to={i.window_end_t} highlightFrom={i.window_start_t} sign={sign} color={TEAMS[i.team].color} />
    </MomentumToast>
  );
}

const KIND_LABEL: Record<MomentumInsight['kind'], string> = {
  'momentum-swing': 'Momentum swing', 'pressure-surge': 'Pressure spell', 'attacking-surge': 'Attacking surge',
  'defensive-stand': 'Defensive stand', 'goal-buildup': 'Goal build-up', 'substitution-impact': 'Substitution impact',
};

function InsightCue({ i }: { i: MomentumInsight }) {
  return <InsightLowerThird text={<><b>{i.headline}.</b> {i.explanation}</>} verified={false}
    evidenceLabel={`${i.event_ids.length} linked events`} meta={`${i.minute}'  ·  ${KIND_LABEL[i.kind]}  ·  computed from the event stream`} />;
}

function AiInsightCue({ i, ctx }: { i: MomentumInsight; ctx: OnAirContext }) {
  const { data, failed } = useShared<InsightExplanation>(ctx, `explain:${i.id}`, () => api.explainInsight(ctx.matchId, i.id));
  if (failed) return <InsightCue i={i} />;
  if (!data) {
    return <InsightLowerThird verified={false} evidenceLabel="Writing"
      text={<><b>{i.headline}.</b> {ctx.aiMode === 'foundry' ? 'Microsoft Foundry is writing this insight. Narrative VAR checks every figure before it airs.' : 'Writing this insight in demo mode. Narrative VAR checks every figure before it airs.'}</>}
      meta={`${i.minute}'  ·  ${KIND_LABEL[i.kind]}`} />;
  }
  const v = data.verification;
  return <InsightLowerThird text={v.corrected_text ?? data.explanation} verified={v.status === 'verified'}
    evidenceLabel={`Narrative VAR: ${v.status}`}
    meta={`${data.source === 'foundry' ? 'Microsoft Foundry' : 'Demo mode'}  ·  ${i.minute}'  ·  ${KIND_LABEL[i.kind]}`} />;
}

function VarCue({ claim, at, ctx }: { claim: string; at: number; ctx: OnAirContext }) {
  const { data, failed } = useShared<VerificationResult>(ctx, `verify:${at}:${claim}`, () => api.verify(ctx.matchId, claim, at));
  if (!data) {
    return <VarBanner status={failed ? 'unverified' : 'checking'} quote={`“${claim}”`} evidence={0}
      source={failed ? 'The check could not be completed.' : <>Checking the claim against <b>the event data</b> up to {Math.floor(at / 60)}'</>} />;
  }
  const evidence = Math.max(0, Math.min(5, Math.round(data.evidence_strength)));
  const quote = data.corrected_text ? <><s>“{claim}”</s>{' '}<mark>{data.corrected_text}</mark></> : `“${claim}”`;
  return <VarBanner status={data.status} quote={quote} evidence={evidence} source={<><b>{data.summary}</b>  Checked at {Math.floor(at / 60)}'.</>} />;
}

function PunditCue({ cue, debate }: { cue: Cue; debate: DebateResult }) {
  const arg = debate.arguments.find(a => a.pundit === cue.pundit && a.round === 'opening') ?? debate.arguments.find(a => a.pundit === cue.pundit);
  if (!arg || !cue.pundit) return null;
  const take = clip(arg.text, 200);
  return <PunditNameplate pundit={cue.pundit} take={take.includes(arg.pick_name) ? take : `Picks ${arg.pick_name}. ${take}`} />;
}

function PotmCue({ debate }: { debate: DebateResult }) {
  const nonZero = debate.verdict_stats.filter(s => !/^0(\.0+)?%?$/.test(s.value));
  const stats = (nonZero.length >= 3 ? nonZero : debate.verdict_stats).slice(0, 3);
  return <PlayerOfTheMatch team={debate.verdict_team} name={debate.verdict_name} number={debate.verdict_number} rating={debate.verdict_rating}
    stats={stats} votes={debate.votes.map(v => ({ pundit: v.pundit, agrees: v.agrees }))} />;
}

function HalftimeCue({ ctx }: { ctx: OnAirContext }) {
  const { data } = useShared<Record<string, TeamStats>>(ctx, 'stats:first-half', () => api.stats(ctx.matchId, 0, HALF_T));
  const h = data?.[ctx.home], a = data?.[ctx.away];
  const plates = h && a ? [
    { k: 'Shots', v: `${h.shots}  :  ${a.shots}` },
    { k: 'Expected goals', v: `${h.xg.toFixed(2)}  :  ${a.xg.toFixed(2)}` },
    { k: 'Possession', v: `${Math.round(h.possession_pct)}%  :  ${Math.round(a.possession_pct)}%` },
  ] : [];
  return (
    <TitleCard kicker="PULSE AI  ·  Studio" word="Half-time" accentWord="Analysis" home={ctx.home} away={ctx.away} score={scoreAt(ctx.events, HALF_T)}>
      {plates.length > 0 && (
        <div className="pb-recap-moments">
          {plates.map(p => (
            <div key={p.k} className="pb-moment pb-plate"><div className="pb-moment__min">{p.k.toUpperCase()}</div><div className="pb-moment__txt pb-num">{p.v}</div></div>
          ))}
        </div>
      )}
      <TitleWave pulse={ctx.pulse} until={HALF_T} />
    </TitleCard>
  );
}

function FulltimeCue({ ctx }: { ctx: OnAirContext }) {
  const goals = ctx.events.filter(e => e.type === 'goal');
  return (
    <TitleCard kicker="Full-time" word="Match" accentWord="Recap" tone="lime" home={ctx.home} away={ctx.away} score={scoreAt(ctx.events, FULL_T)}
      footer="EVERY MOMENT HAS A STORY. EVERY STORY HAS EVIDENCE.">
      {goals.length > 0 && (
        <div className="pb-recap-moments">
          {goals.slice(0, 5).map(g => (
            <div key={g.id} className="pb-moment pb-plate" style={{ ['--_c' as string]: TEAMS[g.team ?? ctx.home].color }}>
              <div className="pb-moment__min"><img src={`${A}/icons/football/goal.svg`} alt="" className="bc-moment-icon" />{g.minute}'</div>
              <div className="pb-moment__txt">{surname(g.player_name)}  <span className="pb-num">{g.score_home}-{g.score_away}</span></div>
            </div>
          ))}
        </div>
      )}
      <TitleWave pulse={ctx.pulse} until={FULL_T} />
    </TitleCard>
  );
}
