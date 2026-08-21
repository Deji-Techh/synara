// @vitest-environment node
//
// Mode-dispatch matrix for the `chat:stream` handler. Proves that the
// requestedChatMode sent by the server's EngineAdapter routes each of the
// four modes to the right engine execution path:
//
//   build       → legacy streamText flow, codebase-priming user turn present
//   ask         → handleLocalAgentStream with readOnly: true
//   plan        → handleLocalAgentStream with planModeOnly: true
//   local-agent → handleLocalAgentStream with neither flag (full agent)
//
// The handler is invoked through the real `ipcMain.handle("chat:stream")`
// registration with all heavy leaves mocked; chat-mode resolution
// (resolveChatModeForTurn) stays REAL so a regression in mode normalization
// or dispatch fails here, not in production.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// --- electron capture ----------------------------------------------------

const ipcHandlers = new Map<string, (event: unknown, input: unknown) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, input: unknown) => unknown) => {
      ipcHandlers.set(channel, fn);
    }),
  },
  app: { on: vi.fn(), getPath: vi.fn(() => "/tmp/caide-engine-test-userdata") },
}));

vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      log: vi.fn(),
      info: vi.fn(),
      error: (...args: unknown[]) => {
        if (process.env.CAIDE_TEST_VERBOSE_LOGS) console.error("[engine-log]", ...args);
      },
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// --- settings ------------------------------------------------------------

const mockSettings = {
  selectedModel: { provider: "openai", name: "gpt-test" },
  providerSettings: {
    openai: { apiKey: { value: "test-key", encryptionType: "plaintext" } },
  },
};

vi.mock("@/main/settings", () => ({
  readSettings: vi.fn(() => mockSettings),
  writeSettings: vi.fn(),
  setSentinelActiveChat: vi.fn(),
}));

// --- safeSend capture ----------------------------------------------------

const sentEvents: Array<{ channel: string; payload: unknown }> = [];

vi.mock("@/ipc/utils/safe_sender", () => ({
  safeSend: vi.fn((sender: unknown, channel: string, ...args: unknown[]) => {
    sentEvents.push({ channel, payload: args[0] });
  }),
}));

// --- ai.streamText capture ----------------------------------------------

type StreamTextOptions = Record<string, unknown>;
let streamTextCalls: StreamTextOptions[] = [];

function makeFakeStream() {
  return {
    fullStream: (async function* () {
      yield { type: "text-delta", delta: "Hello from fake model" };
      yield { type: "finish", finishReason: "stop", usage: { totalTokens: 10 } };
    })(),
    response: Promise.resolve({ messages: [] }),
    steps: Promise.resolve([]),
  };
}

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    streamText: vi.fn((options: StreamTextOptions) => {
      streamTextCalls.push(options);
      return makeFakeStream();
    }),
    generateText: vi.fn(async () => ({ text: "" })),
    stepCountIs: (n: number) => ({ steps: n }),
    hasToolCall: (toolName: string) => ({ toolName }),
  };
});

// --- db -------------------------------------------------------------------

type ChatMessageRow = {
  id: number;
  role: string;
  content: string;
  createdAt: Date;
  sourceCommitHash?: string | null;
};

let nextMessageId = 1;
const insertedMessages: Array<Record<string, unknown>> = [];

function makeDbMock() {
  const returning = () => Promise.resolve();
  return {
    query: {
      chats: {
        findFirst: vi.fn(async () => ({
          id: 1,
          appId: 100,
          title: null,
          chatMode: null,
          createdAt: new Date(),
          messages: [...insertedMessages] as ChatMessageRow[],
          app: {
            id: 100,
            name: "fixture-app",
            path: fixtureDir,
            createdAt: new Date(),
            updatedAt: new Date(),
            supabaseProjectId: null,
            supabaseOrganizationSlug: null,
            neonProjectId: null,
            neonActiveBranchId: null,
            neonDevelopmentBranchId: null,
            appIdentity: null,
            needsAppBlueprint: false,
            testingEnabled: false,
            chatContext: null,
          },
        })),
      },
    },
    insert: vi.fn(() => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const row = { id: nextMessageId++, ...data };
          insertedMessages.push(row);
          return [row];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    })),
    delete: vi.fn(() => ({
      where: returning,
    })),
    select: vi.fn(() => {
      const chain = {} as {
        from: ReturnType<typeof vi.fn>;
        innerJoin: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
        all: ReturnType<typeof vi.fn>;
      };
      chain.from = vi.fn(() => chain);
      chain.innerJoin = vi.fn(() => chain);
      // Some call sites await the where() result; others call .all() on it.
      // Return a promise that also carries a sync all().
      const makeWhereResult = () => {
        const p = Object.assign(Promise.resolve([]), { all: () => [] as unknown[] });
        return p;
      };
      chain.where = vi.fn(makeWhereResult);
      chain.all = vi.fn(() => [] as unknown[]);
      return chain;
    }),
  };
}

vi.mock("@/db", () => ({ db: makeDbMock() }));

// --- heavy leaves ----------------------------------------------------------

const fixtureDir = mkdtempSync(path.join(os.tmpdir(), "caide-chat-modes-"));

vi.mock("@/paths/paths", () => ({
  getCaideAppPath: vi.fn((p: string) => p),
}));

vi.mock("../../../prompts/system_prompt", () => ({
  constructSystemPrompt: vi.fn(({ chatMode }: { chatMode?: string }) => `SYS:${chatMode ?? "?"}`),
  readAiRules: vi.fn(async () => ""),
}));

vi.mock("../../utils/framework_utils", () => ({
  detectFrameworkType: vi.fn(async () => "flutter"),
}));

vi.mock("../../utils/theme_utils", () => ({
  getThemePromptById: vi.fn(() => ""),
}));

vi.mock("../../../prompts/supabase_prompt", () => ({
  getSupabaseAvailableSystemPrompt: vi.fn(() => ""),
  getSupabaseAvailableSystemPromptForFlutter: vi.fn(() => ""),
  SUPABASE_NOT_AVAILABLE_SYSTEM_PROMPT: "",
}));

vi.mock("../../../neon_admin/neon_prompt_context", () => ({
  buildNeonPromptForApp: vi.fn(async () => ""),
}));

vi.mock("../../../supabase_admin/supabase_context", () => ({
  getSupabaseContext: vi.fn(async () => ""),
  getSupabaseClientCode: vi.fn(async () => ""),
}));

vi.mock("../../utils/codebase", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/codebase")>();
  return {
    ...actual,
    extractCodebase: vi.fn(async () => ({
      formattedOutput: "lib/main.dart",
      files: [{ path: "lib/main.dart", content: "void main() {}" }],
    })),
  };
});

vi.mock("../testing_chat_handlers", () => ({
  getTestResponse: vi.fn(() => null),
  streamTestResponse: vi.fn(async () => ""),
  noteAck: vi.fn(),
}));

vi.mock("../../utils/get_model_client", () => ({
  getModelClient: vi.fn(async () => ({
    modelClient: { model: { id: "test-model" }, builtinProviderId: "openai" },
    isEngineEnabled: false,
    isSmartContextEnabled: false,
  })),
}));

vi.mock("../../utils/telemetry", () => ({
  sendTelemetryEvent: vi.fn(),
  sendTelemetryException: vi.fn(),
}));

vi.mock("../../utils/token_utils", () => ({
  getMaxTokens: vi.fn(async () => 4096),
  getTemperature: vi.fn(async () => 0.7),
}));

vi.mock("../../utils/provider_options", () => ({
  getProviderOptions: vi.fn(() => ({})),
  getAiHeaders: vi.fn(() => ({})),
}));

vi.mock("../../utils/cache_breakpoints", () => ({
  withSystemCacheBreakpoint: (v: unknown) => v,
  withToolCacheBreakpoint: (v: unknown) => v,
}));

vi.mock("../../utils/mcp_consent", () => ({
  requireMcpToolConsent: vi.fn(),
  clearPendingMcpConsentsForChat: vi.fn(),
}));

vi.mock("../../utils/mcp_manager", () => ({
  mcpManager: { getClient: vi.fn(async () => ({ tools: vi.fn(async () => ({})) })) },
}));

vi.mock("../../processors/response_processor", () => ({
  dryRunSearchReplace: vi.fn(async () => []),
  processFullResponseActions: vi.fn(async () => ({ error: null })),
}));

vi.mock("../../processors/tsc", () => ({
  generateProblemReport: vi.fn(async () => ({})),
  getTypeCheckPreconditionKind: vi.fn(() => null),
}));

vi.mock("../../processors/code_explorer", () => ({
  isCodeExplorerReady: vi.fn(() => false),
}));

vi.mock("../../utils/git_utils", () => ({
  getCurrentCommitHash: vi.fn(async () => "c0ffee0"),
}));

vi.mock("../../utils/versioned_codebase_context", () => ({
  processChatMessagesWithVersionedFiles: vi.fn(async () => undefined),
}));

vi.mock("../../utils/ai_messages_utils", () => ({
  ensureReasoningConsistency: vi.fn((msgs: unknown) => msgs),
  parseAiMessagesJson: vi.fn(
    (message: { role?: string; content?: string }) =>
      message?.content ? [{ role: message.role ?? "user", content: message.content }] : [],
  ),
  getAiMessagesJsonIfWithinLimit: vi.fn(() => null),
}));

// The unit under observation.
const handleLocalAgentStream = vi.fn(async () => true);

vi.mock("../../../pro/main/ipc/handlers/local_agent/local_agent_handler", () => ({
  handleLocalAgentStream: (...args: unknown[]) => handleLocalAgentStream(...(args as [])),
}));

// --- import handler AFTER mocks -------------------------------------------

import { registerChatStreamHandlers } from "../chat_stream_handlers";

const fakeEvent = {
  sender: {
    id: 0,
    isDestroyed: () => false,
    send: () => {},
  },
};

async function invokeChatStream(requestedChatMode: string) {
  insertedMessages.length = 0;
  nextMessageId = 1;
  streamTextCalls = [];
  sentEvents.length = 0;
  handleLocalAgentStream.mockClear();
  const handler = ipcHandlers.get("chat:stream");
  if (!handler) throw new Error("chat:stream handler not registered");
  return handler(fakeEvent, {
    chatId: 1,
    prompt: "make me a flutter counter app",
    requestedChatMode,
  });
}

describe("chat:stream mode dispatch", () => {
  beforeEach(() => {
    registerChatStreamHandlers();
  });

  it("build mode uses the legacy streamText flow with codebase priming", async () => {
    const result = await invokeChatStream("build");

    expect(result).toBe(1);
    expect(handleLocalAgentStream).not.toHaveBeenCalled();
    expect(streamTextCalls.length).toBeGreaterThan(0);

    const messages = streamTextCalls[0].messages as Array<{
      role: string;
      content: string;
    }>;
    // Build mode primes the model with the codebase as a user turn.
    expect(
      messages.some(
        (m) =>
          m.role === "user" &&
          typeof m.content === "string" &&
          m.content.startsWith("This is my codebase."),
      ),
    ).toBe(true);
    // And ends with the actual user prompt.
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    expect(lastUser?.content).toContain("make me a flutter counter app");
    // Build mode streams through to completion.
    const channels = sentEvents.map((e) => e.channel);
    expect(channels).toContain("chat:response:end");
    expect(channels).toContain("chat:stream:end");
  }, 30_000);

  it("ask mode dispatches into the local agent stream read-only", async () => {
    const result = await invokeChatStream("ask");

    expect(result).toBe(1);
    expect(handleLocalAgentStream).toHaveBeenCalledTimes(1);
    const options = handleLocalAgentStream.mock.calls[0][3] as Record<string, unknown>;
    expect(options.readOnly).toBe(true);
    expect(options.planModeOnly).toBeFalsy();
    expect(options.systemPrompt).toContain("SYS:local-agent");
    expect(streamTextCalls).toHaveLength(0);
  }, 30_000);

  it("plan mode dispatches into the local agent stream plan-only", async () => {
    const result = await invokeChatStream("plan");

    expect(result).toBe(1);
    expect(handleLocalAgentStream).toHaveBeenCalledTimes(1);
    const options = handleLocalAgentStream.mock.calls[0][3] as Record<string, unknown>;
    expect(options.planModeOnly).toBe(true);
    expect(options.readOnly).toBeFalsy();
    expect(options.systemPrompt).toContain("SYS:plan");
    expect(streamTextCalls).toHaveLength(0);
  }, 30_000);

  it("local-agent mode dispatches into the full agent stream", async () => {
    const result = await invokeChatStream("local-agent");

    expect(result).toBe(1);
    expect(handleLocalAgentStream).toHaveBeenCalledTimes(1);
    const options = handleLocalAgentStream.mock.calls[0][3] as Record<string, unknown>;
    expect(options.readOnly).toBeFalsy();
    expect(options.planModeOnly).toBeFalsy();
    expect(options.systemPrompt).toContain("SYS:local-agent");
    expect(streamTextCalls).toHaveLength(0);
  }, 30_000);
});
