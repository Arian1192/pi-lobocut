import { describe, it, expect } from "vitest";
import { generateSentinelId, levenshteinDistance, extractSentinelCandidate, evaluateProbe, getZone, getProbeInterval, determineHealthState } from "../src/utils.js";
import type { LobocutConfig } from "../src/types.js";

describe("generateSentinelId", () => {
  it("should generate an ID matching LBC-XXXX-NNNN format", () => {
    const id = generateSentinelId();
    expect(id).toMatch(/^LBC-[A-Z]{4}-\d{4}$/);
  });

  it("should generate unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, generateSentinelId));
    expect(ids.size).toBe(100);
  });
});

describe("levenshteinDistance", () => {
  it("should return 0 for identical strings", () => {
    expect(levenshteinDistance("LBC-ABCD-1234", "LBC-ABCD-1234")).toBe(0);
  });

  it("should return 1 for single character substitution", () => {
    expect(levenshteinDistance("LBC-ABCD-1234", "LBC-ABCD-1235")).toBe(1);
  });

  it("should return 2 for two character differences", () => {
    expect(levenshteinDistance("LBC-ABCD-1234", "LBC-ABCD-1256")).toBe(2);
  });

  it("should handle insertions", () => {
    expect(levenshteinDistance("LBC-ABCD-1234", "LBC-ABCD-12345")).toBe(1);
  });

  it("should handle deletions", () => {
    expect(levenshteinDistance("LBC-ABCD-1234", "LBC-ABCD-123")).toBe(1);
  });
});

describe("extractSentinelCandidate", () => {
  it("should extract a sentinel from text", () => {
    expect(extractSentinelCandidate("The code is LBC-ABCD-1234 here")).toBe("LBC-ABCD-1234");
  });

  it("should return null when no sentinel is present", () => {
    expect(extractSentinelCandidate("No sentinel here")).toBeNull();
  });

  it("should extract the first sentinel found", () => {
    expect(extractSentinelCandidate("LBC-ABCD-1234 and LBC-EFGH-5678")).toBe("LBC-ABCD-1234");
  });
});

describe("evaluateProbe", () => {
  it("should return exact match for identical sentinel", () => {
    const result = evaluateProbe("LBC-ABCD-1234", "The sentinel is LBC-ABCD-1234");
    expect(result.state).toBe("GREEN");
    expect(result.distance).toBe(0);
  });

  it("should return YELLOW for distance 1", () => {
    const result = evaluateProbe("LBC-ABCD-1234", "The sentinel is LBC-ABCD-1235");
    expect(result.state).toBe("YELLOW");
    expect(result.distance).toBe(1);
  });

  it("should return YELLOW for distance 2", () => {
    const result = evaluateProbe("LBC-ABCD-1234", "The sentinel is LBC-ABCD-1256");
    expect(result.state).toBe("YELLOW");
    expect(result.distance).toBe(2);
  });

  it("should return RED for distance > 2", () => {
    const result = evaluateProbe("LBC-ABCD-1234", "The sentinel is LBC-ABCD-9999");
    expect(result.state).toBe("RED");
    expect(result.distance).toBe(4);
  });

  it("should return RED when no candidate found", () => {
    const result = evaluateProbe("LBC-ABCD-1234", "I don't remember");
    expect(result.state).toBe("RED");
    expect(result.distance).toBeNull();
  });
});

describe("getZone", () => {
  it("should return safe for < 70%", () => {
    expect(getZone(69)).toBe("safe");
    expect(getZone(0)).toBe("safe");
  });

  it("should return caution for >= 70% and < 90%", () => {
    expect(getZone(70)).toBe("caution");
    expect(getZone(89)).toBe("caution");
  });

  it("should return critical for >= 90%", () => {
    expect(getZone(90)).toBe("critical");
    expect(getZone(100)).toBe("critical");
  });
});

describe("getProbeInterval", () => {
  const config: LobocutConfig = {
    alertMode: "suggest",
    baseInterval: 10000,
    accelerateThreshold: 70,
    acceleratedInterval: 5000,
    criticalInterval: 2000,
    levenshteinTolerance: 2,
  };

  it("should return base interval in safe zone", () => {
    expect(getProbeInterval(50000, 50, config)).toBe(10000);
  });

  it("should return accelerated interval in caution zone", () => {
    expect(getProbeInterval(150000, 75, config)).toBe(5000);
  });

  it("should return critical interval in critical zone", () => {
    expect(getProbeInterval(180000, 90, config)).toBe(2000);
  });
});

describe("determineHealthState", () => {
  const config: LobocutConfig = {
    alertMode: "suggest",
    baseInterval: 10000,
    accelerateThreshold: 70,
    acceleratedInterval: 5000,
    criticalInterval: 2000,
    levenshteinTolerance: 2,
  };

  it("should return GREEN when no probe and tokens < 70%", () => {
    expect(determineHealthState(null, 50, config)).toBe("GREEN");
  });

  it("should return GREEN for exact match", () => {
    expect(determineHealthState({ state: "GREEN", distance: 0, candidate: "LBC-ABCD-1234" }, 50, config)).toBe("GREEN");
  });

  it("should return YELLOW when tokens >= 70%", () => {
    expect(determineHealthState(null, 75, config)).toBe("YELLOW");
  });

  it("should return YELLOW for distance 1-2", () => {
    expect(determineHealthState({ state: "YELLOW", distance: 1, candidate: "LBC-ABCD-1235" }, 50, config)).toBe("YELLOW");
    expect(determineHealthState({ state: "YELLOW", distance: 2, candidate: "LBC-ABCD-1256" }, 50, config)).toBe("YELLOW");
  });

  it("should return RED for probe failure", () => {
    expect(determineHealthState({ state: "RED", distance: 3, candidate: "LBC-ABCD-9999" }, 50, config)).toBe("RED");
  });

  it("should return RED for critical zone without recent pass", () => {
    expect(determineHealthState(null, 95, config)).toBe("RED");
  });
});
