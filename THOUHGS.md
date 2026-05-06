# Context Sentinel: AI Integrity & Sweet Spot Monitor (V1)

## 1. Project Overview

**Context Sentinel** (`lobocut`) is a Pi extension that monitors the "cognitive health" of an LLM during long-range CLI or coding sessions. It identifies the exact moment (the "Sweet Spot") where the model begins to suffer from attention decay or "lobotomization."

**Runtime:** Pi Extension (`ExtensionAPI`).
**Hook Strategy:** `before_agent_start` (probe injection), `message_end` (response evaluation), `session_before_compact` / `session_compact` (compaction-aware state), `turn_end` (token tracking).

---

## 2. Token Tracking

**Source:** `ctx.getContextUsage()` (Pi built-in).
- Uses last `AssistantMessage.usage.totalTokens` when available (authoritative API metadata).
- Falls back to `estimateTokens()` (chars/4 heuristic) for trailing messages.
- Returns `{ tokens: number | null, contextWindow: number, percent: number | null }`.

**Decision:** Piggyback on Pi's existing infrastructure. No local tokenizer dependency.

---

## 3. The Hidden Needle Strategy

### 3.1 Sentinel Injection (One-Shot)
- On `session_start`, inject `SENTINEL_ID` into the system prompt **exactly once**.
- Format: `LBC-[A-Z]{4}-[0-9]{4}` (e.g., `LBC-KLMX-7392`).
- The prefix `LBC-` serves as an anchor for regex extraction.
- **Never** re-inject the ID in normal turns. The model must recall it from deep context.

### 3.2 Probe Injection (Temporary)
When the token threshold is reached:
1. `before_agent_start` appends a temporary instruction: *"Before your main response, state the Session Integrity Code given at the start of this session, on its own line."*
2. The model responds with the code + its normal answer.
3. `message_end` evaluates the response.
4. The probe instruction is **removed** for the next turn.

### 3.3 Response Evaluation
1. **Extract candidate:** Regex-match the sentinel pattern `LBC-[A-Z0-9]{4}-[0-9]{4}` from the response text.
2. **No candidate found** → **RED**.
3. **Exact match** (`candidate === original`) → **GREEN**.
4. **Candidate exists:** Compute Levenshtein distance vs. original:
   - `distance === 0` → **GREEN**
   - `distance 1-2` → **YELLOW** (early degradation)
   - `distance > 2` → **RED** (memory corruption)

Levenshtein measures **memory fidelity**, not formatting politeness. Words around the code are ignored.

---

## 4. Health Indicators (States)

| State | Condition | Visual |
|-------|-----------|--------|
| **GREEN** | Token count < 70% AND (probe passed exact or no probe yet) | 🟢 Footer status |
| **YELLOW** | Tokens > 70% OR probe returned distance 1-2 | 🟡 Footer + toast notification |
| **RED** | Probe failed (distance > 2 or missing) OR tokens > 90% with no recent pass | 🔴 Footer + toast + degradation logged |

---

## 5. Probe Timing (Híbrido)

| Zone | Threshold | Interval |
|------|-----------|----------|
| Safe | < 70% contextWindow | Every 10k tokens |
| Caution | ≥ 70% | Every 5k tokens |
| Critical | ≥ 90% | Every 2k tokens |

Base interval and thresholds are configurable via `/sentinel`.

---

## 6. Persistence

### 6.1 Session State (`appendEntry`)
Stored as `CustomEntry` with `customType: "lobocut-state"`:
```typescript
{
  sentinelId: string,
  lastCheckTokens: number,
  firstFailureTokens: number | null,
  healthHistory: Array<{
    timestamp: number,
    tokens: number,
    state: "GREEN" | "YELLOW" | "RED",
    distance: number | null,
    responseSnippet: string
  }>
}
```
Survives `/reload`, branching, and session resume.

### 6.2 Global Analytics Log
Append-only JSONL at `~/.pi/agent/lobocut-log.jsonl`:
```jsonl
{"timestamp":1234567890,"sessionId":"uuid","model":"claude-sonnet-4-5","contextWindow":200000,"firstFailureTokens":154000,"sentinelId":"LBC-KLMX-7392"}
```
Enables cross-session sweet spot analysis per model/provider.

---

## 7. Compaction Handling

### 7.1 Pre-Compact (`session_before_compact`)
Intercept the compaction summary and inject:
> "Session started with integrity code `LBC-XXXX-NNNN`."

This ensures the sentinel ID survives in the summarized context.

### 7.2 Post-Compact (`session_compact`)
- Reset `lastCheckTokens` to the current post-compact token count.
- Log a state entry: `"compaction_reset"`.
- The "time since injection" counter resets, but the ID remains accessible via the summary.

---

## 8. User Interface

### 8.1 Continuous Status
`ctx.ui.setStatus("lobocut", "🟢 45k/200k")` — always visible in footer.

### 8.2 Transient Alerts
`ctx.ui.notify()` on state transitions (especially YELLOW→RED).

### 8.3 Command: `/sentinel`
Opens a configuration dialog (`ctx.ui.select()` or `ctx.ui.custom()`) for:

| Setting | Options | Default |
|---------|---------|---------|
| Alert mode | `passive` / `suggest` / `silent` | `suggest` |
| Base interval | 5000 / 10000 / 20000 | 10000 |
| Accelerate threshold | 70 / 80 / 90 | 70 |
| Accelerated interval | 2000 / 5000 | 5000 |
| Levenshtein tolerance | 0 / 1 / 2 | 2 |

Config persisted via `appendEntry("lobocut-config", { ... })`.

### 8.4 RED Action
When RED triggers:
- Toast: *"🔴 Lobocut: Degradation detected at ~154k tokens. Sweet spot logged."*
- If alert mode is `suggest`: append hint *"Consider `/compact` or `/new`."*
- Never auto-compact or block user input.

---

## 9. Silent Failure Warning

The model may continue outputting code with 100% confidence even when it has forgotten the sentinel. The sentinel is the only empirical defense. All other heuristics (latency, response length) are secondary signals.

---

## 10. References

- Matt Pocock: Attention Decay is linear; models lose coherence before the context window is technically full.
- "Lost in the Middle" phenomenon: LLMs recall beginning and end, fail at the middle 60%.
- Pi `ExtensionAPI`: `ctx.getContextUsage()`, `before_agent_start`, `message_end`, `session_before_compact`, `appendEntry`, `ui.setStatus`, `ui.notify`.
