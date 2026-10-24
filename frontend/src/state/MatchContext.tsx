import * as React from 'react';
import { api } from '../services/api';
import { useReplay } from '../hooks/useReplay';
import type { Capabilities, MatchDetail, MatchEvent, MatchState, MomentumInsight, PulsePoint, ScenarioInfo } from '../types/api';

export type View = 'live' | 'broadcast' | 'pulse' | 'var' | 'studio' | 'recap';

interface Ctx {
  view: View;
  setView: (v: View) => void;
  scenarios: ScenarioInfo[];
  capabilities: Capabilities | null;
  match: MatchDetail | null;
  events: MatchEvent[];
  pulse: PulsePoint[];
  insights: MomentumInsight[];
  loading: boolean;
  error: string | null;
  loadScenario: (key: string) => Promise<void>;
  replay: ReturnType<typeof useReplay>;
  serverState: MatchState | null;
  selectedInsightId: string | null;
  selectInsight: (id: string | null) => void;
  reload: () => void;
}

const MatchContext = React.createContext<Ctx | null>(null);

export function MatchProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = React.useState<View>('live');
  const [scenarios, setScenarios] = React.useState<ScenarioInfo[]>([]);
  const [capabilities, setCapabilities] = React.useState<Capabilities | null>(null);
  const [match, setMatch] = React.useState<MatchDetail | null>(null);
  const [events, setEvents] = React.useState<MatchEvent[]>([]);
  const [pulse, setPulse] = React.useState<PulsePoint[]>([]);
  const [insights, setInsights] = React.useState<MomentumInsight[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [serverState, setServerState] = React.useState<MatchState | null>(null);
  const [selectedInsightId, selectInsight] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);

  const replay = useReplay(events, pulse, insights);
  const { reset } = replay;

  const loadScenario = React.useCallback(async (key: string) => {
    setLoading(true); setError(null); selectInsight(null);
    try {
      const detail = await api.generate(key);
      const [ev, pu, ins] = await Promise.all([api.events(detail.meta.id), api.pulse(detail.meta.id), api.insights(detail.meta.id)]);
      setMatch(detail); setEvents(ev); setPulse(pu); setInsights(ins);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [reset]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sc, caps] = await Promise.all([api.scenarios(), api.capabilities().catch(() => null)]);
        if (cancelled) return;
        setScenarios(sc); setCapabilities(caps);
        await loadScenario(sc[0]?.key ?? 'comeback');
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [loadScenario, tick]);

  // Authoritative server-side state, throttled while the replay clock moves.
  const t = replay.state.t;
  React.useEffect(() => {
    if (!match) return;
    const id = match.meta.id;
    const handle = window.setTimeout(() => { api.state(id, t).then(setServerState).catch(() => undefined); }, replay.state.playing ? 400 : 60);
    return () => window.clearTimeout(handle);
  }, [match, t, replay.state.playing]);

  const value: Ctx = {
    view, setView, scenarios, capabilities, match, events, pulse, insights, loading, error, loadScenario, replay, serverState,
    selectedInsightId, selectInsight, reload: () => setTick(x => x + 1),
  };
  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch(): Ctx {
  const ctx = React.useContext(MatchContext);
  if (!ctx) throw new Error('useMatch must be used inside MatchProvider');
  return ctx;
}
