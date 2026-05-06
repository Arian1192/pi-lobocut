import type { LobocutState } from "./types.js";
import { generateSentinelId } from "./utils.js";

export function createInitialState(): LobocutState {
  return {
    sentinelId: generateSentinelId(),
    lastCheckTokens: 0,
    firstFailureTokens: null,
    healthHistory: [],
  };
}

export function loadState(sessionManager: { getBranch(): Array<{ type: string; customType?: string; data?: unknown }> }): LobocutState {
  const entries = sessionManager.getBranch();
  let latestState: LobocutState | null = null;

  for (const entry of entries) {
    if (entry.type === "custom" && entry.customType === "lobocut-state") {
      latestState = entry.data as LobocutState;
    }
  }

  return latestState ?? createInitialState();
}

export function saveState(
  appendEntry: (customType: string, data: unknown) => void,
  state: LobocutState
): void {
  appendEntry("lobocut-state", state);
}
