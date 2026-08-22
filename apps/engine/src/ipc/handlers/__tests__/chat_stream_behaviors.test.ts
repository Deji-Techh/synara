// @vitest-environment node
//
// Behavioral tests for the headless `chat:stream` handler, ported from the
// dyad×caide hybrid-harness integration suite (renderer-driven tests cannot
// run against the engine, so the behaviors are asserted at the IPC seam):
//
//   1. Cancellation — cancelling a mid-flight stream records the cancelled
//      assistant message ("[Response cancelled by user]") and emits a
//      chat:response:end with wasCancelled (ported from
//      cancelled_message.integration.test.ts).
//   2. Message projection — full-message chat:response:chunk refreshes never
//      leak main-process-only AI history (aiMessagesJson) to the renderer
//      (ported from chat_stream_message_projection.test.ts).
//
// Shares its mock scaffolding shape with chat_mode_dispatch.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// --- electron capture ------------------------------------------------------

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

// --- settings ---------------------------------------------------------------

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

// --- safeSend capture -------------------------------------------------------

const sentEvents: Array<{ channel: string; payload: unknown }> = [];

vi.mock("@/ipc/utils/safe_sender", () => ({
  safeSend: vi.fn((sender: unknown, channel: string, ...args: unknown[]) => {
    sentEvents.push({ channel, payload: args[0] });
  }),
}));

// --- ai.streamText capture with a gate for mid-stream cancellation ----------

type StreamTextOptions = Record<string, unknown>;
let streamTextCalls: StreamTextOptions[] = [];
// When set, the fake stream stalls after its first delta until __wait is
// invoked — lets a test cancel mid-flight deterministically.
let streamGate: { __wait?: (resolve: () => void) => void } | null = null;

function makeFakeStream(options: StreamTextOptions) {
  const gate = streamGate;
  streamGate = null;
  return {
    fullStream: (async function* () {
      yield { type: "text-delta", delta: "partial " };
      if (gate) {
        await new Promise<void>((resolve) => gate.__wait?.(resolve));
        // After release, check whether the handler's abort controller fired.
        if ((options as { abortSignal?: AbortSignal }).abortSignal?.aborted) {
          yield { type: "text-delta", delta: "after-cancel" };
        }
      }
      yield { type: "text-delta", delta: "rest" };
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
      return makeFakeStream(options);
    }),
    generateText: vi.fn(async () => ({ text: "" })),
    stepCountIs: (n: number) => ({ steps: n }),
    hasToolCall: (toolName: string) => ({ toolName }),
  };
});

// --- db ----------------------------------------------------------------------

type ChatMessageRow = {
  id: number;
  role: string;
  content: string;
  createdAt: Date;
  sourceCommitHash?: string | null;
  aiMessagesJson?: unknown;
};

let nextMessageId = 1;
const insertedMessages: Array<Record<string, unknown>> = [];
const messageUpdates: Array<Record<string, unknown>> = [];

const fixtureDir = mkdtempSync(path.join(os.tmpdir(), "caide-chat-behaviors-"));

function makeDbMock() {
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
      set: (data: Record<string, unknown>) => ({
        where: () => {
          messageUpdates.push(data);
          return Promise.resolve();
        },
      }),
    })),
    delete: vi.fn(() => ({
      where: () => Promise.resolve(),
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
      const makeWhereResult = () =>
        Object.assign(Promise.resolve([]), { all: () => [] as unknown[] });
      chain.where = vi.fn(makeWhereResult);
      chain.all = vi.fn(() => [] as unknown[]);
      return chain;
    }),
  };
}

vi.mock("@/db", () => ({ db: makeDbMock() }));

// --- heavy leaves ------------------------------------------------------------

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

vi.mock("../../../utils/codebase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../utils/codebase")>();
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
  parseAiMessagesJson: vi.fn((message: { role?: string; content?: string }) =>
    message?.content ? [{ role: message.role ?? "user", content: message.content }] : [],
  ),
  getAiMessagesJsonIfWithinLimit: vi.fn(() => null),
}));

vi.mock("../../../pro/main/ipc/handlers/local_agent/local_agent_handler", () => ({
  handleLocalAgentStream: vi.fn(async () => true),
}));

// --- import handler AFTER mocks ----------------------------------------------

import { registerChatStreamHandlers } from "../chat_stream_handlers";

const fakeEvent = {
  sender: {
    id: 0,
    isDestroyed: () => false,
    send: () => {},
  },
};

beforeEach(() => {
  registerChatStreamHandlers();
  insertedMessages.length = 0;
  nextMessageId = 1;
  streamTextCalls = [];
  sentEvents.length = 0;
  messageUpdates.length = 0;
});

describe("chat:stream cancellation behavior", () => {
  it("records the cancelled assistant message and emits wasCancelled end event", async () => {
    // Gate the fake stream so it stalls after its first delta.
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    streamGate = { __wait: (resolve) => void released.then(resolve) };

    const streamPromise = ipcHandlers.get("chat:stream")!(fakeEvent, {
      chatId: 1,
      prompt: "build me an app",
      requestedChatMode: "build",
    });

    // Wait until streaming actually began (first chunk or stream start seen).
    await vi.waitFor(
      () => {
        expect(sentEvents.some((e) => e.channel === "chat:response:chunk")).toBe(true);
      },
      { timeout: 5_000 },
    );

    // Cancel mid-flight through the real cancel channel.
    const cancelHandler = ipcHandlers.get("chat:cancel");
    expect(cancelHandler).toBeDefined();
    await cancelHandler!(fakeEvent, 1);

    // Release the stalled fake stream so the handler can settle.
    release();

    const result = await streamPromise;
    expect(result).toBe(1);

    // The renderer sees a cancelled end event.
    const endEvent = sentEvents.find(
      (e) =>
        e.channel === "chat:response:end" &&
        (e.payload as { wasCancelled?: boolean }).wasCancelled === true,
    );
    expect(endEvent).toBeDefined();

    // The partial assistant message is persisted with the cancellation notice.
    const cancelledUpdate = messageUpdates.find(
      (data) =>
        typeof data.content === "string" &&
        (data.content as string).includes("[Response cancelled by user]"),
    );
    expect(cancelledUpdate).toBeDefined();
  }, 30_000);
});

describe("chat:stream message projection", () => {
  it("never leaks main-process-only AI history in full message chunks", async () => {
    const mainOnlyPayload = "MAIN_PROCESS_ONLY_STREAM_HISTORY";
    insertedMessages.push({
      id: nextMessageId++,
      role: "assistant",
      content: "Visible agent response",
      createdAt: new Date(),
      aiMessagesJson: {
        sdkVersion: "ai@v6",
        messages: [{ role: "assistant", content: mainOnlyPayload }],
      },
    });

    const result = (await ipcHandlers.get("chat:stream")!(fakeEvent, {
      chatId: 1,
      prompt: "hello there",
      requestedChatMode: "build",
    })) as unknown;

    expect(result).toBe(1);

    const fullChunks = sentEvents
      .filter((e) => e.channel === "chat:response:chunk")
      .map((e) => e.payload)
      .filter(
        (payload): payload is { messages: Array<Record<string, unknown>> } =>
          typeof payload === "object" &&
          payload !== null &&
          Array.isArray((payload as { messages?: unknown }).messages),
      );

    // Both the placeholder refresh and the post-stream refresh are full
    // message chunks; neither may expose main-process-only agent history.
    expect(fullChunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of fullChunks) {
      expect(JSON.stringify(chunk)).not.toContain(mainOnlyPayload);
      expect(chunk.messages.every((message) => !("aiMessagesJson" in message))).toBe(true);
    }
  }, 30_000);
});
