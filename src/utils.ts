import type { HealthState, LobocutConfig, ProbeResult, Zone } from "./types.js";

export function generateSentinelId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  let id = "LBC-";
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  id += "-";
  for (let i = 0; i < 4; i++) {
    id += digits[Math.floor(Math.random() * digits.length)];
  }
  return id;
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function extractSentinelCandidate(text: string): string | null {
  const match = text.match(/LBC-[A-Z0-9]{4}-\d{4}/);
  return match ? match[0] : null;
}

export function evaluateProbe(originalId: string, responseText: string): ProbeResult {
  const candidate = extractSentinelCandidate(responseText);
  if (!candidate) {
    return { state: "RED", distance: null, candidate: null };
  }
  const distance = levenshteinDistance(originalId, candidate);
  if (distance === 0) {
    return { state: "GREEN", distance: 0, candidate };
  }
  if (distance <= 2) {
    return { state: "YELLOW", distance, candidate };
  }
  return { state: "RED", distance, candidate };
}

export function getZone(percent: number): Zone {
  if (percent >= 90) return "critical";
  if (percent >= 70) return "caution";
  return "safe";
}

export function getProbeInterval(tokens: number, percent: number, config: LobocutConfig): number {
  const zone = getZone(percent);
  switch (zone) {
    case "critical":
      return config.criticalInterval;
    case "caution":
      return config.acceleratedInterval;
    default:
      return config.baseInterval;
  }
}

export function determineHealthState(
  probeResult: ProbeResult | null,
  tokenPercent: number,
  config: LobocutConfig
): HealthState {
  if (probeResult?.state === "RED") return "RED";
  if (tokenPercent >= 90 && (!probeResult || probeResult.state !== "GREEN")) return "RED";

  if (tokenPercent >= config.accelerateThreshold) return "YELLOW";
  if (probeResult?.state === "YELLOW") return "YELLOW";

  return "GREEN";
}
