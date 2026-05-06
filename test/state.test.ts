import { describe, it, expect, vi } from "vitest";
import { loadState, saveState, createInitialState } from "../src/state.js";
import type { LobocutState } from "../src/types.js";

describe("createInitialState", () => {
  it("should create state with a valid sentinel ID", () => {
    const state = createInitialState();
    expect(state.sentinelId).toMatch(/^LBC-[A-Z]{4}-\d{4}$/);
    expect(state.lastCheckTokens).toBe(0);
    expect(state.firstFailureTokens).toBeNull();
    expect(state.healthHistory).toEqual([]);
  });
});

describe("loadState", () => {
  it("should return default state when no entries exist", () => {
    const sessionManager = {
      getBranch: vi.fn().mockReturnValue([]),
    } as any;
    const state = loadState(sessionManager);
    expect(state.sentinelId).toMatch(/^LBC-[A-Z]{4}-\d{4}$/);
    expect(state.lastCheckTokens).toBe(0);
  });

  it("should load the latest lobocut-state entry", () => {
    const entry1: LobocutState = {
      sentinelId: "LBC-ABCD-1234",
      lastCheckTokens: 1000,
      firstFailureTokens: null,
      healthHistory: [],
    };
    const entry2: LobocutState = {
      sentinelId: "LBC-EFGH-5678",
      lastCheckTokens: 5000,
      firstFailureTokens: 4500,
      healthHistory: [
        { timestamp: 123, tokens: 4500, state: "RED", distance: 3, responseSnippet: "foo" },
      ],
    };
    const sessionManager = {
      getBranch: vi.fn().mockReturnValue([
        { type: "custom", customType: "lobocut-state", data: entry1 },
        { type: "message", message: { role: "user" } },
        { type: "custom", customType: "lobocut-state", data: entry2 },
      ]),
    } as any;
    const state = loadState(sessionManager);
    expect(state.sentinelId).toBe("LBC-EFGH-5678");
    expect(state.lastCheckTokens).toBe(5000);
    expect(state.firstFailureTokens).toBe(4500);
    expect(state.healthHistory).toHaveLength(1);
  });

  it("should ignore non-lobocut custom entries", () => {
    const sessionManager = {
      getBranch: vi.fn().mockReturnValue([
        { type: "custom", customType: "other-state", data: {} },
      ]),
    } as any;
    const state = loadState(sessionManager);
    expect(state.sentinelId).toMatch(/^LBC-[A-Z]{4}-\d{4}$/);
  });
});

describe("saveState", () => {
  it("should append a lobocut-state entry", () => {
    const appendEntry = vi.fn();
    const state: LobocutState = {
      sentinelId: "LBC-TEST-1234",
      lastCheckTokens: 1000,
      firstFailureTokens: null,
      healthHistory: [],
    };
    saveState(appendEntry, state);
    expect(appendEntry).toHaveBeenCalledWith("lobocut-state", state);
  });
});
