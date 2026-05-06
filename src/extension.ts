import type {
  ExtensionAPI,
  ExtensionContext,
  BeforeAgentStartEvent,
  SessionStartEvent,
  SessionBeforeCompactEvent,
  SessionCompactEvent,
  TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { loadState, saveState, createInitialState } from "./state.js";
import type { HealthState, LobocutConfig, LobocutState } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import {
  evaluateProbe,
  getProbeInterval,
  determineHealthState,
} from "./utils.js";
import { appendGlobalLog } from "./log.js";

const PROBE_INSTRUCTION =
  "Before your main response, state the Session Integrity Code given at the start of this session, on its own line.";

function getTextFromAssistant(message: AssistantMessage): string {
  return message.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c: TextContent) => c.text)
    .join("");
}

function stripSentinelFromText(text: string): string {
  return text.replace(/LBC-[A-Z0-9]{4}-\d{4}/g, "").trim();
}

export default function lobocutExtension(pi: ExtensionAPI) {
  let state: LobocutState = createInitialState();
  let config: LobocutConfig = { ...DEFAULT_CONFIG };
  let currentHealth: HealthState = "GREEN";
  let sentinelInjected = false;
  let probeInjected = false;

  function updateFooter(ctx: ExtensionContext) {
    const usage = ctx.getContextUsage();
    const tokens = usage?.tokens ?? 0;
    const window = usage?.contextWindow ?? 0;
    const emoji = currentHealth === "GREEN" ? "🟢" : currentHealth === "YELLOW" ? "🟡" : "🔴";
    ctx.ui.setStatus("lobocut", `${emoji} ${Math.round(tokens / 1000)}k/${Math.round(window / 1000)}k`);
  }

  function handleStateTransition(
    newHealth: HealthState,
    tokens: number,
    ctx: ExtensionContext
  ) {
    if (newHealth === currentHealth) return;

    if (newHealth === "RED" && currentHealth !== "RED") {
      const suggestion = config.alertMode === "suggest" ? " Consider `/compact` or `/new`." : "";
      ctx.ui.notify(
        `🔴 Lobocut: Degradation detected at ~${tokens.toLocaleString()} tokens. Sweet spot logged.${suggestion}`,
        "error"
      );
    } else if (newHealth === "YELLOW" && currentHealth === "GREEN") {
      ctx.ui.notify(`🟡 Lobocut: Caution zone reached at ~${tokens.toLocaleString()} tokens.`, "warning");
    }

    currentHealth = newHealth;
    updateFooter(ctx);
  }

  pi.on("session_start", async (event: SessionStartEvent, ctx: ExtensionContext) => {
    const loaded = loadState(ctx.sessionManager);

    if (event.reason === "startup" || event.reason === "new") {
      state = createInitialState();
      saveState(pi.appendEntry, state);
    } else {
      state = loaded;
      currentHealth = "GREEN";
    }

    sentinelInjected = false;
    probeInjected = false;
    updateFooter(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    state = loadState(ctx.sessionManager);
    updateFooter(ctx);
  });

  pi.on(
    "before_agent_start",
    (async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
      const usage = ctx.getContextUsage();
      const tokens = usage?.tokens ?? 0;
      const percent = usage?.percent ?? 0;

      // Inject sentinel exactly once at the start of the session
      if (!sentinelInjected) {
        sentinelInjected = true;
        const systemPrompt = event.systemPrompt + `\n\nSENTINEL_ID: ${state.sentinelId}`;

        // If we're also due for a probe, append probe instruction
        if (usage && tokens - state.lastCheckTokens >= getProbeInterval(tokens, percent, config)) {
          probeInjected = true;
          return { systemPrompt: systemPrompt + "\n\n" + PROBE_INSTRUCTION };
        }

        return { systemPrompt };
      }

      // Check if probe should fire
      if (usage && tokens - state.lastCheckTokens >= getProbeInterval(tokens, percent, config)) {
        probeInjected = true;
        return { systemPrompt: event.systemPrompt + "\n\n" + PROBE_INSTRUCTION };
      }

      return;
    }) as any
  );

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return undefined;

    const assistantMsg = event.message as AssistantMessage;

    // If we injected a probe this turn, evaluate the response
    if (probeInjected) {
      probeInjected = false;
      const text = getTextFromAssistant(assistantMsg);
      const result = evaluateProbe(state.sentinelId, text);

      const usage = ctx.getContextUsage();
      const tokens = usage?.tokens ?? 0;
      const percent = usage?.percent ?? 0;

      if (result.state === "RED" && state.firstFailureTokens === null) {
        state.firstFailureTokens = tokens;

        // Log to global analytics
        const model = ctx.model;
        appendGlobalLog({
          timestamp: Date.now(),
          sessionId: ctx.sessionManager.getSessionFile() ?? "unknown",
          model: model ? `${model.provider}/${model.id}` : "unknown",
          contextWindow: usage?.contextWindow ?? 0,
          firstFailureTokens: tokens,
          sentinelId: state.sentinelId,
        });
      }

      state.healthHistory.push({
        timestamp: Date.now(),
        tokens,
        state: result.state,
        distance: result.distance,
        responseSnippet: stripSentinelFromText(text).slice(0, 200),
      });
      state.lastCheckTokens = tokens;
      saveState(pi.appendEntry, state);

      const newHealth = determineHealthState(result, percent, config);
      handleStateTransition(newHealth, tokens, ctx);

      // Strip sentinel from visible response
      const cleanedText = stripSentinelFromText(text);
      const cleanedContent: TextContent[] =
        cleanedText.length > 0 ? [{ type: "text", text: cleanedText }] : [];

      // Preserve non-text content (thinking, tool calls)
      const otherContent = assistantMsg.content.filter((c) => c.type !== "text");

      return {
        message: {
          ...assistantMsg,
          content: [...cleanedContent, ...otherContent],
        },
      };
    }

    return undefined;
  });

  pi.on("turn_end", async (_event: TurnEndEvent, ctx: ExtensionContext) => {
    updateFooter(ctx);
  });

  pi.on(
    "session_before_compact",
    (async (event: SessionBeforeCompactEvent) => {
      const instruction = `Session started with integrity code ${state.sentinelId}.`;
      const customInstructions = event.customInstructions
        ? `${event.customInstructions}\n\n${instruction}`
        : instruction;
      return { customInstructions };
    }) as any
  );

  pi.on("session_compact", async (_event: SessionCompactEvent, ctx: ExtensionContext) => {
    state.lastCheckTokens = 0;
    state.healthHistory.push({
      timestamp: Date.now(),
      tokens: 0,
      state: currentHealth,
      distance: null,
      responseSnippet: "compaction_reset",
    });
    saveState(pi.appendEntry, state);
    updateFooter(ctx);
  });

  pi.registerCommand("sentinel", {
    description: "Configure Lobocut context sentinel settings",
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify(
        `Lobocut config: ${JSON.stringify(config, null, 2)}`,
        "info"
      );
    },
  });
}
