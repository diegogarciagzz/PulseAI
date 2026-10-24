import { LiveIndicator, MatchClock, Score, TEAMS } from '../pulse';
import { useMatch } from '../state/MatchContext';

const PERIOD = { 'pre-match': '1H', 'first-half': '1H', 'half-time': 'HT', 'second-half': '2H', 'full-time': 'FT' } as const;
const STATUS = { 'pre-match': 'Kick-off pending', 'first-half': 'First half', 'half-time': 'Half-time', 'second-half': 'Second half', 'full-time': 'Full-time' } as const;

export function Scoreboard() {
  const { match, replay } = useMatch();
  if (!match) return null;
  const home = TEAMS[match.meta.home], away = TEAMS[match.meta.away];
  const { state, score } = replay;
  const live = state.status === 'first-half' || state.status === 'second-half';
  return (
    <div className="pulse-card scorebar" aria-label={`${home.name} ${score.home}, ${away.name} ${score.away}`}>
      <div className="scorebar__team">
        <span className="scorebar__strip" style={{ background: home.color }} />
        <img src={home.badge} alt={home.name} />
        <div><div className="scorebar__name">{home.name}</div><div className="scorebar__nick">Home · {match.teams[match.meta.home].nickname}</div></div>
      </div>
      <div className="scorebar__centre">
        <div className="scorebar__score"><Score value={score.home} /><i /><Score value={score.away} /></div>
        <div className="scorebar__meta">
          <MatchClock seconds={state.t} period={PERIOD[state.status]} />
          {live ? <LiveIndicator label={state.playing ? 'Live replay' : 'Paused'} /> : <span className="scorebar__status">{STATUS[state.status]}</span>}
        </div>
        <div className="scorebar__status" data-testid="match-title">{match.meta.title} · seed {match.meta.seed} · fictional clubs, synthetic data</div>
      </div>
      <div className="scorebar__team scorebar__team--away">
        <div><div className="scorebar__name">{away.name}</div><div className="scorebar__nick">Away · {match.teams[match.meta.away].nickname}</div></div>
        <img src={away.badge} alt={away.name} />
        <span className="scorebar__strip" style={{ background: away.color }} />
      </div>
    </div>
  );
}
