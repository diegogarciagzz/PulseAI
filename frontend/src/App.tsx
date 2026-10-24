import * as React from 'react';
import { Activity, FileText, Radio, ShieldCheck, Users } from 'lucide-react';
import { PulseLogo } from './pulse';
import { ErrorState, Loading, ModeBadge } from './components/common';
import { MatchProvider, useMatch, type View } from './state/MatchContext';
import { LiveMatch } from './features/live-match/LiveMatch';
import { MatchPulse } from './features/match-pulse/MatchPulse';
import { NarrativeVar } from './features/narrative-var/NarrativeVar';
import { Studio } from './features/ai-studio/Studio';
import { Recap } from './features/match-recap/Recap';

const TABS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'live', label: 'Live Match', icon: <Radio /> },
  { key: 'pulse', label: 'Match Pulse', icon: <Activity /> },
  { key: 'var', label: 'Narrative VAR', icon: <ShieldCheck /> },
  { key: 'studio', label: 'AI Studio', icon: <Users /> },
  { key: 'recap', label: 'Match Recap', icon: <FileText /> },
];

function Shell() {
  const { view, setView, capabilities, loading, error, match, reload } = useMatch();
  return (
    <div className="app">
      <header className="app-top">
        <a className="app-top__logo" href="#" onClick={e => { e.preventDefault(); setView('live'); }} aria-label="PULSE AI home"><PulseLogo height={30} /></a>
        <nav className="app-tabs" aria-label="Sections">
          {TABS.map(t => <button key={t.key} aria-current={view === t.key ? 'page' : undefined} onClick={() => setView(t.key)}>{t.icon}{t.label}</button>)}
        </nav>
        <div className="app-top__right"><ModeBadge caps={capabilities} /></div>
      </header>
      <main className="app-main">
        {error && <ErrorState title="The PULSE AI backend is not reachable" detail={`${error}. Start it with: cd backend && uvicorn app.main:app --reload`} action={<button className="btn btn--primary" style={{ width: 'fit-content' }} onClick={reload}>Retry</button>} />}
        {loading && !error && <Loading />}
        {!loading && !error && match && (
          <>
            {view === 'live' && <LiveMatch />}
            {view === 'pulse' && <MatchPulse />}
            {view === 'var' && <NarrativeVar />}
            {view === 'studio' && <Studio />}
            {view === 'recap' && <Recap />}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return <MatchProvider><Shell /></MatchProvider>;
}
