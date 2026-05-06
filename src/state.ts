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

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === "lobocut-state") {
      return entry.data as LobocutState;
    }
  }

  return createInitialState();
}

export function saveState(
  appendEntry: (customType: string, data: unknown) => void,
  state: LobocutState
): void {
  appendEntry("lobocut-state", state);
}
