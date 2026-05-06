# PRD: Context Sentinel Skill (V1 - Integrity Monitor)

## 1. Purpose
The **Context Sentinel** (`lobocut`) is a Pi extension designed to identify the **"Sweet Spot"** (degradation point) of an LLM during a CLI session. It alerts the user when the model starts losing the ability to retrieve information from the beginning of the context window (i.e., when "lobotomization" begins).

## 2. Scope (V1 - Observational)
*   **Quantitative Tracking:** Real-time monitoring of token consumption via `ctx.getContextUsage()`.
*   **Qualitative Tracking:** Execution of "Canary Checks" (Hidden Needle Test) to verify model lucidity.
*   **Alert System:** Persistent footer status + transient terminal notifications (Green/Yellow/Red) based on context health.
*   **Degradation Logging:** Record the exact token count where the first retrieval failure occurs, both per-session and globally.

## 3. Functional Requirements

### 3.1 Canary Injection
At session start, inject a unique, random string into the system prompt **exactly once**:
```
SENTINEL_ID: LBC-XXXX-NNNN
```
Format: `LBC-[A-Z]{4}-[0-9]{4}` (e.g., `LBC-KLMX-7392`).

### 3.2 Frequency of Test
Perform a "lucidity check" at hybrid intervals:
*   **Safe zone** (< 70% of context window): every 10,000 tokens.
*   **Caution zone** (≥ 70%): every 5,000 tokens.
*   **Critical zone** (≥ 90%): every 2,000 tokens.

### 3.3 Response Evaluation
When a probe fires, temporarily append an instruction in `before_agent_start` asking the model to output the sentinel ID. Evaluate the response in `message_end`:
1. Extract candidate via regex matching the sentinel pattern.
2. **GREEN:** Exact match (Levenshtein distance 0).
3. **YELLOW:** Candidate found with Levenshtein distance 1–2 (early degradation).
4. **RED:** No candidate or distance > 2 (memory corruption).

Strip the sentinel code from the visible assistant response before it reaches the user or session history.

### 3.4 Non-Intrusive Operation
The check is a natural turn in the conversation flow. No separate API calls, no extra SDKs. The probe instruction is injected and removed within a single turn.

### 3.5 Compaction Resilience
*   Before compaction: ensure the sentinel ID is included in the compaction summary.
*   After compaction: reset the probe token counter to the new post-compact baseline.

## 4. Health Indicators (States)

| State | Condition |
|-------|-----------|
| **GREEN** | Token count < 70% of model limit AND (no probe yet OR probe passed exact). |
| **YELLOW** | Token count ≥ 70% of model limit OR probe returned distance 1–2. |
| **RED** | Probe failed (distance > 2 or missing) OR token count ≥ 90% with no recent successful pass. |

## 5. User Interface

*   **Footer:** Persistent status line (`ctx.ui.setStatus`) showing current state and token usage.
*   **Notifications:** Toast alerts on state transitions (YELLOW→RED).
*   **Command:** `/sentinel` opens configuration dialog.

### 5.1 Configuration (`/sentinel`)
| Setting | Options | Default |
|---------|---------|---------|
| Alert mode | passive / suggest / silent | suggest |
| Base interval | 5000 / 10000 / 20000 tokens | 10000 |
| Accelerate threshold | 70 / 80 / 90 percent | 70 |
| Accelerated interval | 2000 / 5000 tokens | 5000 |
| Levenshtein tolerance | 0 / 1 / 2 | 2 |

## 6. Persistence

### 6.1 Session State
Stored as `CustomEntry` (`lobocut-state`) in the session JSONL:
*   `sentinelId`
*   `lastCheckTokens`
*   `firstFailureTokens`
*   `healthHistory[]`

### 6.2 Global Log
Append-only JSONL at `~/.pi/agent/lobocut-log.jsonl` for cross-session sweet spot analysis:
```jsonl
{"timestamp":1234567890,"sessionId":"uuid","model":"...","contextWindow":200000,"firstFailureTokens":154000}
```

## 7. Success Criteria
*   The tool accurately identifies the token threshold where the model fails to recall the `SENTINEL_ID`.
*   Zero interference with the user's actual code or file system.
*   State survives Pi `/reload`, session resume, and compaction events.
*   First degradation event is logged with model name, provider, context window, and exact token count.
