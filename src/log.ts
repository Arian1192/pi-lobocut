import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface GlobalLogEntry {
  timestamp: number;
  sessionId: string;
  model: string;
  contextWindow: number;
  firstFailureTokens: number | null;
  sentinelId: string;
}

function getGlobalLogPath(): string {
  return join(homedir(), ".pi", "agent", "lobocut-log.jsonl");
}

export function appendGlobalLog(entry: GlobalLogEntry): void {
  try {
    const path = getGlobalLogPath();
    if (!existsSync(dirname(path))) {
      mkdirSync(dirname(path), { recursive: true });
    }
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
    // Silently fail if we can't write to the global log
  }
}
