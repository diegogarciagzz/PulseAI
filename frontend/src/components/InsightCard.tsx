import { StatusBadge, TEAMS } from '../pulse';
import type { MomentumInsight } from '../types/api';

export function InsightCard({ insight, selected, onSelect, dense = false }: { insight: MomentumInsight; selected?: boolean; onSelect?: (i: MomentumInsight) => void; dense?: boolean }) {
  const marker = insight.marker_kind === 'goal' ? 'goal-event' : insight.marker_kind;
  return (
    <article className="pulse-card insight-card fade-in" data-team={insight.team} aria-selected={selected} role="option" tabIndex={0}
      onClick={() => onSelect?.(insight)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(insight); } }}>
      <div className="insight-card__head">
        <img src={`/assets/match-pulse/markers/${marker}.svg`} alt="" />
        <span className="feed__min">{insight.minute}'</span>
        <span className="insight-card__title">{insight.headline}</span>
      </div>
      {!dense && <p className="insight-card__text">{insight.explanation}</p>}
      <div className="insight-card__meta">
        <span className="pulse-text-caption muted">{TEAMS[insight.team].short} · {insight.kind.replace('-', ' ')} · importance {Math.round(insight.importance * 100)}</span>
        {insight.verification_status && <StatusBadge status={insight.verification_status} />}
        <span className="pulse-text-caption muted">{insight.event_ids.length} evidence events</span>
      </div>
    </article>
  );
}
