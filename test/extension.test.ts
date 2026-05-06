import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import lobocutExtension from "../src/extension.js";

function createMockPi(): ExtensionAPI {
  const handlers = new Map<string, Function[]>();
  const commands = new Map<string, { description?: string; handler: Function }>();

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    registerCommand: vi.fn((name: string, options: { description?: string; handler: Function }) => {
      commands.set(name, options);
    }),
    registerTool: vi.fn(),
    registerShortcut: vi.fn(),
    registerFlag: vi.fn(),
    getFlag: vi.fn(),
    registerMessageRenderer: vi.fn(),
    sendMessage: vi.fn(),
    sendUserMessage: vi.fn(),
    appendEntry: vi.fn(),
    setSessionName: vi.fn(),
    getSessionName: vi.fn(),
    setLabel: vi.fn(),
    exec: vi.fn(),
    getActiveTools: vi.fn(),
    getAllTools: vi.fn(),
    setActiveTools: vi.fn(),
    getCommands: vi.fn(),
    setModel: vi.fn(),
    getThinkingLevel: vi.fn(),
    setThinkingLevel: vi.fn(),
    registerProvider: vi.fn(),
    unregisterProvider: vi.fn(),
    events: {} as any,
  } as ExtensionAPI;
}

function createMockCtx(overrides: Partial<ExtensionContext> = {}): ExtensionContext {
  return {
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn(),
      input: vi.fn(),
      editor: vi.fn(),
      custom: vi.fn(),
      onTerminalInput: vi.fn(),
      setWorkingMessage: vi.fn(),
      setWorkingVisible: vi.fn(),
      setWorkingIndicator: vi.fn(),
      setHiddenThinkingLabel: vi.fn(),
      setWidget: vi.fn(),
      setFooter: vi.fn(),
      setHeader: vi.fn(),
      setTitle: vi.fn(),
      pasteToEditor: vi.fn(),
      setEditorText: vi.fn(),
      getEditorText: vi.fn(),
      addAutocompleteProvider: vi.fn(),
      setEditorComponent: vi.fn(),
      getEditorComponent: vi.fn(),
      theme: {} as any,
      getAllThemes: vi.fn(),
      getTheme: vi.fn(),
      setTheme: vi.fn(),
      getToolsExpanded: vi.fn(),
      setToolsExpanded: vi.fn(),
    },
    hasUI: true,
    cwd: "/tmp",
    sessionManager: {
      getBranch: vi.fn().mockReturnValue([]),
      getEntries: vi.fn().mockReturnValue([]),
      getLeafId: vi.fn().mockReturnValue("leaf-1"),
    } as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: vi.fn().mockReturnValue(true),
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: vi.fn().mockReturnValue(false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn().mockReturnValue({ tokens: 1000, contextWindow: 200000, percent: 0.5 }),
    compact: vi.fn(),
    getSystemPrompt: vi.fn().mockReturnValue("You are a helpful assistant."),
    ...overrides,
  };
}

describe("lobocutExtension", () => {
  it("should register expected event handlers", () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("message_end", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("turn_end", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_before_compact", expect.any(Function));
    expect(pi.on).toHaveBeenCalledWith("session_compact", expect.any(Function));
  });

  it("should register /sentinel command", () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    expect(pi.registerCommand).toHaveBeenCalledWith(
      "sentinel",
      expect.objectContaining({
        description: expect.stringContaining("Lobocut"),
        handler: expect.any(Function),
      })
    );
  });

  it("should create initial state on startup session_start", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    const sessionStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_start")[1];
    const ctx = createMockCtx();
    await sessionStartHandler({ reason: "startup" }, ctx);

    expect(pi.appendEntry).toHaveBeenCalledWith(
      "lobocut-state",
      expect.objectContaining({
        sentinelId: expect.stringMatching(/^LBC-[A-Z]{4}-\d{4}$/),
        lastCheckTokens: 0,
        firstFailureTokens: null,
        healthHistory: [],
      })
    );
  });

  it("should not recreate state on resume", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    const existingState = {
      sentinelId: "LBC-EXIST-9999",
      lastCheckTokens: 5000,
      firstFailureTokens: null,
      healthHistory: [],
    };

    const ctx = createMockCtx({
      sessionManager: {
        getBranch: vi.fn().mockReturnValue([
          { type: "custom", customType: "lobocut-state", data: existingState },
        ]),
        getEntries: vi.fn().mockReturnValue([]),
        getLeafId: vi.fn().mockReturnValue("leaf-1"),
      } as any,
    });

    const sessionStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_start")[1];
    await sessionStartHandler({ reason: "resume" }, ctx);

    expect(pi.appendEntry).not.toHaveBeenCalled();
  });

  it("should inject sentinel into system prompt on first before_agent_start", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    // First trigger session_start to initialize state
    const ctx = createMockCtx();
    const sessionStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_start")[1];
    await sessionStartHandler({ reason: "startup" }, ctx);

    const beforeAgentStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "before_agent_start")[1];
    const event = {
      type: "before_agent_start",
      prompt: "Hello",
      systemPrompt: "You are a helpful assistant.",
      systemPromptOptions: {} as any,
    };

    const result = await beforeAgentStartHandler(event, ctx);
    expect(result?.systemPrompt).toContain("SENTINEL_ID:");
    expect(result?.systemPrompt).toMatch(/LBC-[A-Z]{4}-\d{4}/);
  });

  it("should inject probe when token threshold reached", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    const ctx = createMockCtx({
      getContextUsage: vi.fn().mockReturnValue({ tokens: 11000, contextWindow: 200000, percent: 5.5 }),
    });

    // Initialize state
    const sessionStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_start")[1];
    await sessionStartHandler({ reason: "startup" }, ctx);

    // First turn: inject sentinel
    const beforeAgentStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "before_agent_start")[1];
    await beforeAgentStartHandler({
      type: "before_agent_start",
      prompt: "Hello",
      systemPrompt: "You are a helpful assistant.",
      systemPromptOptions: {} as any,
    }, ctx);

    // Simulate turn_end to update lastCheckTokens
    const turnEndHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "turn_end")[1];
    await turnEndHandler({ type: "turn_end", turnIndex: 0, message: { role: "assistant" } as any, toolResults: [] }, ctx);

    // Second turn: should inject probe because tokens > baseInterval
    const result = await beforeAgentStartHandler({
      type: "before_agent_start",
      prompt: "Hello again",
      systemPrompt: "You are a helpful assistant.",
      systemPromptOptions: {} as any,
    }, ctx);

    expect(result?.systemPrompt).toContain("Session Integrity Code");
  });

  it("should evaluate response in message_end when probe was injected", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    const ctx = createMockCtx({
      getContextUsage: vi.fn().mockReturnValue({ tokens: 11000, contextWindow: 200000, percent: 5.5 }),
    });

    // Initialize
    const sessionStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_start")[1];
    await sessionStartHandler({ reason: "startup" }, ctx);

    const beforeAgentStartHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "before_agent_start")[1];
    await beforeAgentStartHandler({
      type: "before_agent_start",
      prompt: "Hello",
      systemPrompt: "You are a helpful assistant.",
      systemPromptOptions: {} as any,
    }, ctx);

    const messageEndHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "message_end")[1];
    const sentinelId = (pi.appendEntry as any).mock.calls[0][1].sentinelId;

    const event = {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: `The sentinel is ${sentinelId}` }],
        api: "openai-completions",
        provider: "openai",
        model: "gpt-4",
        usage: { input: 1000, output: 500, cost: { input: 0, output: 0, total: 0 } },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    };

    const result = await messageEndHandler(event, ctx);
    expect(result?.message?.content?.[0]?.type).toBe("text");
    expect(result?.message?.content?.[0]?.text).not.toContain(sentinelId);
  });

  it("should handle session_tree by reloading state", async () => {
    const pi = createMockPi();
    lobocutExtension(pi);

    const existingState = {
      sentinelId: "LBC-TREE-9999",
      lastCheckTokens: 8000,
      firstFailureTokens: null,
      healthHistory: [],
    };

    const ctx = createMockCtx({
      sessionManager: {
        getBranch: vi.fn().mockReturnValue([
          { type: "custom", customType: "lobocut-state", data: existingState },
        ]),
        getEntries: vi.fn().mockReturnValue([]),
        getLeafId: vi.fn().mockReturnValue("leaf-1"),
      } as any,
    });

    const sessionTreeHandler = (pi.on as any).mock.calls.find((call: any) => call[0] === "session_tree")[1];
    await sessionTreeHandler({ type: "session_tree" }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("lobocut", expect.stringContaining("🟢"));
  });
});
