import * as React from 'react';
import type { MatchEvent } from '../types/api';
import { EventIcon, eventText } from './common';

const FEED_TYPES = new Set(['goal', 'shot', 'substitution', 'card', 'corner', 'kickoff', 'halftime', 'fulltime', 'foul']);

export function EventFeed({ events, limit = 40, all = false }: { events: MatchEvent[]; limit?: number; all?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const rows = React.useMemo(() => {
    const filtered = all ? events : events.filter(e => FEED_TYPES.has(e.type) || e.key_pass || (e.type === 'recovery' && (e.x ?? 0) >= 70));
    return filtered.slice(-limit).reverse();
  }, [events, limit, all]);
  if (rows.length === 0) return <div className="feed__empty">Press Start replay to begin the match. Events appear here as they happen.</div>;
  return (
    <div className="feed" ref={ref} aria-live="polite" aria-label="Match events">
      {rows.map(e => (
        <div className="feed__row fade-in" key={e.id} data-type={e.type}>
          <span className="feed__min">{String(e.minute).padStart(2, '0')}:{String(e.second).padStart(2, '0')}</span>
          <span className="feed__icon" data-team={e.team ?? undefined}><EventIcon type={e.type} /></span>
          <span>{eventText(e)}</span>
        </div>
      ))}
    </div>
  );
}
