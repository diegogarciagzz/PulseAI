import * as React from 'react';
import { MatchPulseChart, type PulseEvent, type PulseEventKind, TEAMS } from '../../pulse';
import { useMatch } from '../../state/MatchContext';
import type { MomentumInsight } from '../../types/api';

const KIND: Record<string, PulseEventKind> = {
  goal: 'goal', 'momentum-shift': 'momentum-shift', 'attacking-pressure': 'attacking-pressure', 'high-intensity': 'high-intensity',
  'defensive-recovery': 'defensive-recovery', substitution: 'substitution',
};

/** Match Pulse chart bound to the replay clock. Only insights whose window has closed are drawn. */
export function PulseChartPanel({ height = 300, minImportance = 0.6, onSelect }: { height?: number; minImportance?: number; onSelect?: (i: MomentumInsight) => void }) {
  const { match, replay, visibleInsightsForChart, selectedInsightId } = usePulseData(minImportance);
  if (!match) return null;
  const events: PulseEvent[] = visibleInsightsForChart.map(i => ({
    id: i.id, minute: i.t / 60, kind: KIND[i.marker_kind] ?? 'momentum-shift', label: i.headline,
    detail: Object.entries(i.stats).filter(([k]) => k !== 'window').slice(0, 4).map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v), color: TEAMS[i.team].color })),
  }));
  const byId = new Map(visibleInsightsForChart.map(i => [i.id, i]));
  return (
    <MatchPulseChart data={replay.visiblePulse.map(p => ({ minute: p.minute, value: p.value }))} events={events} minute={replay.state.t / 60}
      homeLabel={TEAMS[match.meta.home].short} awayLabel={TEAMS[match.meta.away].short} height={height} animate={false}
      selectedId={selectedInsightId ?? undefined} onEventClick={e => { const ins = e.id ? byId.get(e.id) : undefined; if (ins) onSelect?.(ins); }} />
  );
}

export function usePulseData(minImportance: number) {
  const ctx = useMatch();
  const visibleInsightsForChart = React.useMemo(() => {
    // one marker per minute at most, highest importance wins, goals always shown
    const chosen = new Map<number, MomentumInsight>();
    for (const i of ctx.replay.visibleInsights) {
      if (i.importance < minImportance && i.kind !== 'goal-buildup') continue;
      const key = Math.round(i.t / 60);
      const cur = chosen.get(key);
      if (!cur || i.importance > cur.importance || i.kind === 'goal-buildup') chosen.set(key, i);
    }
    return [...chosen.values()].sort((a, b) => a.t - b.t);
  }, [ctx.replay.visibleInsights, minImportance]);
  return { ...ctx, visibleInsightsForChart };
}
