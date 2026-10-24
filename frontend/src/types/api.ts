// Mirrors backend/app/models/core.py. Keep in sync by hand (small surface).
export type TeamId = 'north-city' | 'south-united';
export type PunditId = 'analyst' | 'fan' | 'tactician';
export type VarStatus = 'verified' | 'corrected' | 'unsupported' | 'conflicted' | 'unverified' | 'checking';

export type EventType =
  | 'kickoff' | 'pass' | 'carry' | 'interception' | 'recovery' | 'tackle' | 'shot' | 'goal'
  | 'foul' | 'card' | 'corner' | 'substitution' | 'halftime' | 'fulltime';

export interface Player {
  id: string; team: TeamId; name: string; number: number; position: 'GK' | 'DF' | 'MF' | 'FW'; role: string; starter: boolean;
}
export interface Team { id: TeamId; name: string; short: string; nickname: string; primary_color: string; secondary_color: string; players: Player[] }

export interface MatchEvent {
  id: string; seq: number; t: number; minute: number; second: number; period: 1 | 2; type: EventType;
  team: TeamId | null; player_id: string | null; player_name: string | null;
  related_player_id: string | null; related_player_name: string | null; outcome: string | null;
  x: number | null; y: number | null; end_x: number | null; end_y: number | null;
  pitch_x: number | null; pitch_y: number | null; pitch_end_x: number | null; pitch_end_y: number | null;
  xg: number | null; progressive: boolean; final_third_entry: boolean; box_entry: boolean; key_pass: boolean;
  sequence_id: number; score_home: number; score_away: number; description: string;
}

export interface ScoreState { home: number; away: number }
export interface MatchMeta {
  id: string; scenario: string; title: string; description: string; seed: number; home: TeamId; away: TeamId;
  created_at: string; event_count: number; final_score: ScoreState; competition: string;
}
export interface TeamStats {
  team: TeamId; possession_pct: number; possession_pct_by_passes: number; passes: number; passes_completed: number; pass_accuracy: number;
  progressive_passes: number; final_third_entries: number; box_entries: number; shots: number; shots_on_target: number; goals: number; xg: number;
  recoveries: number; tackles: number; interceptions: number; corners: number; fouls: number; cards: number; carries: number;
}
export interface PlayerStats {
  player_id: string; name: string; number: number; team: TeamId; position: string; role: string; minutes: number; touches: number;
  passes: number; passes_completed: number; pass_accuracy: number; progressive_passes: number; key_passes: number; assists: number; pre_assists: number;
  goals: number; shots: number; shots_on_target: number; xg: number; carries: number; final_third_entries: number; recoveries: number; tackles: number;
  interceptions: number; defensive_actions: number; fouls: number; cards: number; goals_involved: number;
}
export interface PulsePoint { t: number; minute: number; value: number; home: number; away: number; home_events: number; away_events: number }
export interface EvidenceReference { event_id: string; t: number; minute: number; type: string; team: TeamId | null; player_name: string | null; description: string }
export type InsightKind = 'momentum-swing' | 'pressure-surge' | 'attacking-surge' | 'defensive-stand' | 'goal-buildup' | 'substitution-impact';
export interface MomentumInsight {
  id: string; kind: InsightKind; minute: number; t: number; window_start_t: number; window_end_t: number; team: TeamId; importance: number;
  headline: string; explanation: string; stats: Record<string, number | string>; event_ids: string[]; evidence: EvidenceReference[];
  ai_explanation: string | null; ai_explanation_source: string | null; verification_status: VarStatus | null; marker_kind: string;
}
export interface MatchState {
  match_id: string; t: number; minute: number; second: number; period: 1 | 2;
  status: 'pre-match' | 'first-half' | 'half-time' | 'second-half' | 'full-time';
  score: ScoreState; home_stats: TeamStats; away_stats: TeamStats; on_pitch_home: string[]; on_pitch_away: string[];
}
export interface KeyMoment { label: string; minute: number; t: number; kind: string; team: TeamId | null }
export interface MatchDetail {
  meta: MatchMeta; teams: Record<TeamId, Team>; demo_moments: { label: string; minute: number }[]; key_moments: KeyMoment[];
  final_team_stats: Record<TeamId, TeamStats>;
}
export interface ScenarioInfo { key: string; title: string; description: string; seed: number; demo_moments: { label: string; minute: number }[] }

export interface ClaimWindow { start_t: number; end_t: number; label: string }
export interface NarrativeClaim {
  id: string; text: string; fragment: string | null; kind: 'metric' | 'event' | 'comparison' | 'opinion' | 'unknown'; metric: string | null; team: TeamId | null;
  player_id: string | null; player_name: string | null; comparator: string | null; value: number | null; unit: string | null;
  window: ClaimWindow | null; event_type: string | null; extraction_source: 'deterministic' | 'foundry';
}
export interface ClaimCheck {
  claim: NarrativeClaim; status: VarStatus; actual_value: number | null; actual_label: string | null; tolerance: number | null; reasoning: string;
  evidence: EvidenceReference[]; evidence_strength: number; corrected_text: string | null; alternative_readings: Record<string, number>;
}
export interface VerificationResult {
  id: string; match_id: string; original_text: string; status: VarStatus; claims: ClaimCheck[]; corrected_text: string | null; summary: string;
  window: ClaimWindow | null; checked_at_t: number; evidence_strength: number; groundedness: Record<string, unknown> | null; ai_mode: string; audit: Record<string, unknown>[];
}
export interface ClaimExample { label: string; text: string; category: string; expected: VarStatus }

export interface CandidateScore {
  player_id: string; name: string; team: TeamId; number: number; role: string; analyst_score: number; fan_score: number; tactician_score: number;
  composite: number; stats: PlayerStats;
}
export interface PunditArgument {
  pundit: PunditId; pundit_name: string; round: 'opening' | 'rebuttal'; pick_player_id: string; pick_name: string; text: string;
  source: 'foundry' | 'demo' | 'agent-framework'; verification: VerificationResult | null;
}
export interface DebateResult {
  match_id: string; candidates: CandidateScore[]; arguments: PunditArgument[]; moderator_summary: string; verdict_player_id: string; verdict_name: string;
  verdict_team: TeamId; verdict_number: number; verdict_rating: string; verdict_stats: { label: string; value: string }[];
  votes: { pundit: PunditId; pick: string; agrees: boolean }[]; unanimous: boolean; ai_mode: string; rounds: number;
}
export interface RecapSection { title: string; body: string; status: VarStatus | null }
export interface MatchRecap {
  match_id: string; mode: 'fan' | 'analyst'; language: 'en' | 'es'; headline: string; summary: string; summary_source: string; summary_status: VarStatus | null; final_score: ScoreState;
  key_events: EvidenceReference[]; momentum_shifts: MomentumInsight[]; top_players: PlayerStats[]; verified_insights: RecapSection[];
  player_of_the_match: Record<string, unknown> | null; team_stats: Record<TeamId, TeamStats>; ai_mode: string;
}
export interface Capabilities {
  ai_mode: 'demo' | 'foundry'; ai_mode_label: string; foundry_configured: boolean; foundry_endpoint_host: string | null; foundry_model: string | null;
  agent_framework_available: boolean; evaluation_sdk_available: boolean; groundedness_evaluator_enabled: boolean; credential_source: string | null; notes: string[];
}
export interface InsightExplanation { insight_id: string; explanation: string; source: 'foundry' | 'demo'; verification: VerificationResult }
