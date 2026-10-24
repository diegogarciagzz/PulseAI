import type {
  Capabilities, ClaimExample, DebateResult, InsightExplanation, MatchDetail, MatchEvent, MatchMeta, MatchRecap, MatchState, MomentumInsight,
  PlayerStats, PulsePoint, ScenarioInfo, TeamStats, VerificationResult,
} from '../types/api';

const BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try { const body = await res.json(); detail = body.detail ?? JSON.stringify(body); } catch { /* keep statusText */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ status: string }>('/api/health'),
  capabilities: () => req<Capabilities>('/api/system/capabilities'),
  scenarios: () => req<ScenarioInfo[]>('/api/scenarios'),
  matches: () => req<MatchMeta[]>('/api/matches'),
  generate: (scenario: string, seed?: number) => req<MatchDetail>('/api/matches/generate', { method: 'POST', body: JSON.stringify({ scenario, seed }) }),
  match: (id: string) => req<MatchDetail>(`/api/matches/${id}`),
  events: (id: string) => req<MatchEvent[]>(`/api/matches/${id}/events`),
  pulse: (id: string) => req<PulsePoint[]>(`/api/matches/${id}/pulse`),
  insights: (id: string) => req<MomentumInsight[]>(`/api/matches/${id}/insights`),
  state: (id: string, t: number) => req<MatchState>(`/api/matches/${id}/state?t=${t}`),
  stats: (id: string, from: number, to: number) => req<Record<string, TeamStats>>(`/api/matches/${id}/stats?from_t=${from}&to_t=${to}`),
  players: (id: string, untilT?: number) => req<PlayerStats[]>(`/api/matches/${id}/players${untilT !== undefined ? `?until_t=${untilT}` : ''}`),
  verify: (id: string, text: string, atT?: number) => req<VerificationResult>(`/api/matches/${id}/verify`, { method: 'POST', body: JSON.stringify({ text, at_t: atT }) }),
  claimExamples: (id: string) => req<ClaimExample[]>(`/api/matches/${id}/claims/examples`),
  explainInsight: (id: string, insightId: string) => req<InsightExplanation>(`/api/matches/${id}/insights/${insightId}/explain`, { method: 'POST' }),
  debate: (id: string) => req<DebateResult>(`/api/matches/${id}/debate`, { method: 'POST' }),
  recap: (id: string, mode: 'fan' | 'analyst', lang: 'en' | 'es' = 'en') => req<MatchRecap>(`/api/matches/${id}/recap?mode=${mode}&lang=${lang}`),
};
