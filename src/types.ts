export type HealthState = "GREEN" | "YELLOW" | "RED";
export type AlertMode = "passive" | "suggest" | "silent";
export type Zone = "safe" | "caution" | "critical";

export interface LobocutConfig {
  alertMode: AlertMode;
  baseInterval: number;
  accelerateThreshold: number;
  acceleratedInterval: number;
  criticalInterval: number;
  levenshteinTolerance: number;
}

export interface ProbeResult {
  state: HealthState;
  distance: number | null;
  candidate: string | null;
}

export interface HealthHistoryEntry {
  timestamp: number;
  tokens: number;
  state: HealthState;
  distance: number | null;
  responseSnippet: string;
}

export interface LobocutState {
  sentinelId: string;
  lastCheckTokens: number;
  firstFailureTokens: number | null;
  healthHistory: HealthHistoryEntry[];
}

export const DEFAULT_CONFIG: LobocutConfig = {
  alertMode: "suggest",
  baseInterval: 10000,
  accelerateThreshold: 70,
  acceleratedInterval: 5000,
  criticalInterval: 2000,
  levenshteinTolerance: 2,
};
