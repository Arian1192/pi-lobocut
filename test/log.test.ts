import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendGlobalLog } from "../src/log.js";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("appendGlobalLog", () => {
  let tempDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lobocut-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    try {
      unlinkSync(join(tempDir, ".pi/agent/lobocut-log.jsonl"));
      rmdirSync(join(tempDir, ".pi/agent"));
      rmdirSync(join(tempDir, ".pi"));
      rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
  });

  it("should append a JSONL entry", () => {
    appendGlobalLog({
      timestamp: 1234567890,
      sessionId: "test-session",
      model: "claude-sonnet-4-5",
      contextWindow: 200000,
      firstFailureTokens: 154000,
      sentinelId: "LBC-TEST-1234",
    });

    const logPath = join(tempDir, ".pi/agent/lobocut-log.jsonl");
    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed).toMatchObject({
      timestamp: 1234567890,
      sessionId: "test-session",
      model: "claude-sonnet-4-5",
      contextWindow: 200000,
      firstFailureTokens: 154000,
      sentinelId: "LBC-TEST-1234",
    });
  });
});
