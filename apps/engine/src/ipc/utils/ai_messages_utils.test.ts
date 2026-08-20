import { describe, it, expect } from "vitest";
import {
  ensureReasoningConsistency,
  parseAiMessagesJson,
  getAiMessagesJsonIfWithinLimit,
  sanitizeToolCallMessages,
  MAX_AI_MESSAGES_SIZE,
  type DbMessageForParsing,
} from "@/ipc/utils/ai_messages_utils";
import { AI_MESSAGES_SDK_VERSION } from "@/db/schema";
import type { ModelMessage } from "ai";

describe("parseAiMessagesJson", () => {
  describe("current format (v5 envelope)", () => {
    it("should parse valid v5 envelope format", () => {
      const msg: DbMessageForParsing = {
        id: 1,
        role: "assistant",
        content: "fallback content",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ]);
    });

    it("should parse v5 envelope with complex tool messages", () => {
      const toolMessage: ModelMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me help you with that" },
          {
            type: "tool-call",
            toolCallId: "call-123",
            toolName: "read_file",
            input: { path: "/src/index.ts" },
          },
        ],
      };
      const msg: DbMessageForParsing = {
        id: 2,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [toolMessage],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([toolMessage]);
    });
  });

  describe("legacy format (direct array)", () => {
    it("should parse legacy array format", () => {
      const legacyMessages: ModelMessage[] = [
        { role: "user", content: "Old message" },
        { role: "assistant", content: "Old response" },
      ];
      const msg: DbMessageForParsing = {
        id: 3,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: legacyMessages,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual(legacyMessages);
    });

    it("should handle legacy array with various message types", () => {
      const legacyMessages: ModelMessage[] = [
        { role: "user", content: "Question" },
        { role: "assistant", content: "Answer" },
        { role: "user", content: "Follow up" },
      ];
      const msg: DbMessageForParsing = {
        id: 4,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: legacyMessages,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe("user");
      expect(result[2].role).toBe("user");
    });
  });

  describe("fallback behavior", () => {
    it("should fallback to role/content when aiMessagesJson is null", () => {
      const msg: DbMessageForParsing = {
        id: 5,
        role: "assistant",
        content: "Direct content",
        aiMessagesJson: null,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "Direct content" }]);
    });

    it("should fallback for user messages", () => {
      const msg: DbMessageForParsing = {
        id: 6,
        role: "user",
        content: "User question",
        aiMessagesJson: null,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "user", content: "User question" }]);
    });

    it("should fallback when sdkVersion mismatches", () => {
      const msg: DbMessageForParsing = {
        id: 7,
        role: "assistant",
        content: "fallback content",
        aiMessagesJson: {
          sdkVersion: "ai@v999" as any, // Wrong version
          messages: [{ role: "assistant", content: "Should not be used" }],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "fallback content" }]);
    });

    it("should fallback when messages array is missing role", () => {
      const msg: DbMessageForParsing = {
        id: 8,
        role: "assistant",
        content: "fallback content",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [{ content: "No role here" } as any],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "fallback content" }]);
    });

    it("should fallback when aiMessagesJson is an empty object", () => {
      const msg: DbMessageForParsing = {
        id: 9,
        role: "user",
        content: "fallback content",
        aiMessagesJson: {} as any,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "user", content: "fallback content" }]);
    });

    it("should fallback when legacy array contains invalid entries", () => {
      const msg: DbMessageForParsing = {
        id: 10,
        role: "assistant",
        content: "fallback content",
        aiMessagesJson: [{ role: "user", content: "valid" }, { noRole: true } as any] as any,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "fallback content" }]);
    });

    it("should fallback when messages is not an array", () => {
      const msg: DbMessageForParsing = {
        id: 11,
        role: "assistant",
        content: "fallback content",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: "not an array" as any,
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "fallback content" }]);
    });
  });

  describe("OpenAI itemId stripping", () => {
    it("should strip itemId from text parts with providerOptions", () => {
      const msg: DbMessageForParsing = {
        id: 20,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Hello",
                  providerOptions: {
                    openai: { itemId: "msg_abc123" },
                  },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.text).toBe("Hello");
      expect(part.providerOptions).toBeUndefined();
    });

    it("should strip itemId from tool-call parts", () => {
      const msg: DbMessageForParsing = {
        id: 21,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "call-123",
                  toolName: "read_file",
                  input: { path: "/test" },
                  providerOptions: {
                    openai: { itemId: "fc_abc123" },
                  },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.toolCallId).toBe("call-123");
      expect(part.providerOptions).toBeUndefined();
    });

    it("should sanitize tool-call with empty string input to empty object", () => {
      const msg: DbMessageForParsing = {
        id: 30,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "call-456",
                  toolName: "execute_sql",
                  input: "",
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.toolCallId).toBe("call-456");
      expect(part.input).toEqual({});
    });

    it("should sanitize tool-call with null input to empty object", () => {
      const msg: DbMessageForParsing = {
        id: 31,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "call-789",
                  toolName: "read_file",
                  input: null,
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.toolCallId).toBe("call-789");
      expect(part.input).toEqual({});
    });

    it("should preserve valid tool-call input objects", () => {
      const msg: DbMessageForParsing = {
        id: 32,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool-call",
                  toolCallId: "call-valid",
                  toolName: "read_file",
                  input: { path: "/test" },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.toolCallId).toBe("call-valid");
      expect(part.input).toEqual({ path: "/test" });
    });

    it("should strip itemId from reasoning parts but preserve reasoningEncryptedContent when followed by output", () => {
      const msg: DbMessageForParsing = {
        id: 22,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "reasoning",
                  text: "thinking...",
                  providerOptions: {
                    openai: {
                      itemId: "rs_abc123",
                      reasoningEncryptedContent: "encrypted-data",
                    },
                  },
                },
                {
                  type: "text",
                  text: "Here is my response",
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect((result[0].content as any[]).length).toBe(2);
      const reasoningPart = (result[0].content as any[])[0];
      expect(reasoningPart.text).toBe("thinking...");
      expect(reasoningPart.providerOptions.openai.itemId).toBeUndefined();
      expect(reasoningPart.providerOptions.openai.reasoningEncryptedContent).toBe("encrypted-data");
    });

    it("should filter out orphaned reasoning parts without following output", () => {
      const msg: DbMessageForParsing = {
        id: 22,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "reasoning",
                  text: "thinking without output...",
                  providerOptions: {
                    openai: {
                      itemId: "rs_orphan",
                      reasoningEncryptedContent: "encrypted-data",
                    },
                  },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      // Thinking-mode providers (e.g. DeepSeek) require a prior turn's
      // reasoning_content to be echoed back, so it is preserved even without a
      // following output part.
      expect((result[0].content as any[]).length).toBe(1);
      expect((result[0].content as any[])[0].type).toBe("reasoning");
    });

    it("should keep reasoning followed by tool-call", () => {
      const msg: DbMessageForParsing = {
        id: 22,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "reasoning",
                  text: "thinking before tool call...",
                },
                {
                  type: "tool-call",
                  toolCallId: "call-123",
                  toolName: "read_file",
                  input: { path: "/test" },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect((result[0].content as any[]).length).toBe(2);
      expect((result[0].content as any[])[0].type).toBe("reasoning");
      expect((result[0].content as any[])[1].type).toBe("tool-call");
    });

    it("should filter trailing reasoning after text output", () => {
      const msg: DbMessageForParsing = {
        id: 22,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "output first",
                },
                {
                  type: "reasoning",
                  text: "orphaned reasoning at end",
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      // Trailing reasoning is preserved for thinking-mode providers that
      // require reasoning_content to be echoed back.
      expect((result[0].content as any[]).length).toBe(2);
      expect((result[0].content as any[])[0].type).toBe("text");
      expect((result[0].content as any[])[1].type).toBe("reasoning");
    });

    it("should strip itemId from legacy providerMetadata", () => {
      const msg: DbMessageForParsing = {
        id: 23,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Hello",
                  providerMetadata: {
                    openai: { itemId: "msg_legacy123" },
                  },
                } as any,
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.text).toBe("Hello");
      expect(part.providerMetadata).toBeUndefined();
    });

    it("should strip itemId from legacy array format", () => {
      const msg: DbMessageForParsing = {
        id: 24,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Legacy",
                providerOptions: {
                  openai: { itemId: "msg_legacy_arr" },
                },
              },
            ],
          },
        ] as ModelMessage[],
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.text).toBe("Legacy");
      expect(part.providerOptions).toBeUndefined();
    });

    it("should strip itemId from azure provider key", () => {
      const msg: DbMessageForParsing = {
        id: 25,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Azure",
                  providerOptions: {
                    azure: { itemId: "msg_azure123" },
                  },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.text).toBe("Azure");
      expect(part.providerOptions).toBeUndefined();
    });

    it("should preserve non-OpenAI providerOptions", () => {
      const msg: DbMessageForParsing = {
        id: 26,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Mixed",
                  providerOptions: {
                    openai: { itemId: "msg_strip" },
                    "caide-engine": { someFlag: true },
                  },
                },
              ],
            },
          ] as ModelMessage[],
        },
      };

      const result = parseAiMessagesJson(msg);
      const part = (result[0].content as any[])[0];
      expect(part.providerOptions.openai).toBeUndefined();
      expect(part.providerOptions["caide-engine"]).toEqual({ someFlag: true });
    });

    it("should not modify string content messages", () => {
      const msg: DbMessageForParsing = {
        id: 27,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty content in fallback", () => {
      const msg: DbMessageForParsing = {
        id: 12,
        role: "assistant",
        content: "",
        aiMessagesJson: null,
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([{ role: "assistant", content: "" }]);
    });

    it("should handle empty messages array in v5 format", () => {
      const msg: DbMessageForParsing = {
        id: 13,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: {
          sdkVersion: AI_MESSAGES_SDK_VERSION,
          messages: [],
        },
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([]);
    });

    it("should handle empty legacy array", () => {
      const msg: DbMessageForParsing = {
        id: 14,
        role: "assistant",
        content: "fallback",
        aiMessagesJson: [],
      };

      const result = parseAiMessagesJson(msg);
      expect(result).toEqual([]);
    });
  });
});

describe("getAiMessagesJsonIfWithinLimit", () => {
  it("should return undefined for empty array", () => {
    const result = getAiMessagesJsonIfWithinLimit([]);
    expect(result).toBeUndefined();
  });

  it("should return undefined for null/undefined", () => {
    const result = getAiMessagesJsonIfWithinLimit(null as any);
    expect(result).toBeUndefined();
  });

  it("should return valid payload for small messages", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];

    const result = getAiMessagesJsonIfWithinLimit(messages);
    expect(result).toEqual({
      messages,
      sdkVersion: AI_MESSAGES_SDK_VERSION,
    });
  });

  it("should return undefined for messages exceeding size limit", () => {
    // Create a message that exceeds 1MB
    const largeContent = "x".repeat(MAX_AI_MESSAGES_SIZE + 1000);
    const messages: ModelMessage[] = [{ role: "assistant", content: largeContent }];

    const result = getAiMessagesJsonIfWithinLimit(messages);
    expect(result).toBeUndefined();
  });

  it("should return payload at exactly the size limit", () => {
    // Calculate how much content we can fit
    const basePayload = {
      messages: [{ role: "assistant", content: "" }],
      sdkVersion: AI_MESSAGES_SDK_VERSION,
    };
    const baseSize = JSON.stringify(basePayload).length;
    const remainingSpace = MAX_AI_MESSAGES_SIZE - baseSize;

    const messages: ModelMessage[] = [{ role: "assistant", content: "a".repeat(remainingSpace) }];

    const result = getAiMessagesJsonIfWithinLimit(messages);
    expect(result).toBeDefined();
    expect(result?.messages).toEqual(messages);
  });

  it("should handle messages with complex content types", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here is the result" },
          {
            type: "tool-call",
            toolCallId: "call-abc",
            toolName: "write_file",
            input: { path: "/test.ts", content: "console.log('test')" },
          },
        ],
      },
    ];

    const result = getAiMessagesJsonIfWithinLimit(messages);
    expect(result).toBeDefined();
    expect(result?.sdkVersion).toBe(AI_MESSAGES_SDK_VERSION);
    expect(result?.messages[0]).toEqual(messages[0]);
  });
});

describe("sanitizeToolCallMessages", () => {
  const paired = [
    { role: "user", content: "do it" },
    {
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "read_file" }],
    },
    { role: "tool", content: [{ type: "tool-result", toolCallId: "c1" }] },
  ] as ModelMessage[];

  it("leaves fully paired tool calls untouched", () => {
    expect(sanitizeToolCallMessages(paired)).toEqual(paired);
  });

  it("strips a trailing assistant tool_calls message that has no result", () => {
    const dangling = [
      ...paired,
      { role: "user", content: "again" },
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c2", toolName: "list_files" }],
      },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(dangling);
    expect(result).toEqual([...paired, { role: "user", content: "again" }]);
  });

  it("drops tool-call parts only, keeping any text in the same message", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here goes" },
          { type: "tool-call", toolCallId: "c1", toolName: "run" },
        ],
      },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual([{ type: "text", text: "Here goes" }]);
  });

  it("drops orphaned tool messages that no longer answer a kept call", () => {
    // A tool message whose result id has no matching assistant tool-call is
    // removed, together with any assistant tool-call that nothing answers.
    const messages = [
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c1", toolName: "run" }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "cX" }] },
      { role: "assistant", content: "final text" },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(messages);
    expect(result).toEqual([{ role: "assistant", content: "final text" }]);
  });

  it("keeps a mixed history where one call is answered and another is not", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "read" },
          { type: "tool-call", toolCallId: "c2", toolName: "write" },
        ],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1" }] },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(messages);
    expect(result).toEqual([
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c1", toolName: "read" }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1" }] },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(sanitizeToolCallMessages([])).toEqual([]);
  });

  it("drops an assistant message left with only reasoning after removing a dangling tool-call", () => {
    // cleanMessage keeps a reasoning part because the trailing tool-call counts
    // as its following output; once that unpaired tool-call is removed, the
    // assistant turn would be reasoning-only, which thinking-mode providers
    // reject ("reasoning_content must be passed back"). The whole message goes.
    const messages = [
      {
        role: "user",
        content: "fix the bug",
      },
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me think..." },
          { type: "tool-call", toolCallId: "c1", toolName: "read_file" },
        ],
      },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(messages);
    expect(result).toEqual([{ role: "user", content: "fix the bug" }]);
  });

  it("keeps reasoning when a paired tool-call survives", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "Let me think..." },
          { type: "tool-call", toolCallId: "c1", toolName: "read" },
          { type: "tool-call", toolCallId: "c2", toolName: "write" },
        ],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1" }] },
    ] as ModelMessage[];

    const result = sanitizeToolCallMessages(messages);
    expect(result[0].content).toEqual([
      { type: "reasoning", text: "Let me think..." },
      { type: "tool-call", toolCallId: "c1", toolName: "read" },
    ]);
  });

  it("is a no-op when no tool calls exist", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ] as ModelMessage[];
    expect(sanitizeToolCallMessages(messages)).toEqual(messages);
  });

  it("drops a reasoning-only assistant message even when no tool calls exist", () => {
    // cleanMessage can turn a standalone orphaned reasoning part into empty
    // content, or a reasoning-typed part can survive on its own; both are
    // invalid turns for thinking-mode providers.
    const messages = [
      { role: "user", content: "ok" },
      { role: "assistant", content: [{ type: "reasoning", text: "…" }] },
    ] as ModelMessage[];
    expect(sanitizeToolCallMessages(messages)).toEqual([{ role: "user", content: "ok" }]);
  });

  it("drops an assistant message left with empty content", () => {
    const messages = [
      { role: "user", content: "ok" },
      { role: "assistant", content: [] },
    ] as ModelMessage[];
    expect(sanitizeToolCallMessages(messages)).toEqual([{ role: "user", content: "ok" }]);
  });
});

describe("ensureReasoningConsistency", () => {
  it("is a no-op when the history has no reasoning parts", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(ensureReasoningConsistency(messages)).toEqual(messages);
  });

  it("is a no-op when every assistant message already carries reasoning", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "think" },
          { type: "text", text: "answer" },
        ],
      },
      { role: "tool", content: [] },
    ];
    expect(ensureReasoningConsistency(messages)).toEqual(messages);
  });

  it("injects a non-empty reasoning sentinel into a reasoning-less assistant message when the history has reasoning", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "think" },
          { type: "text", text: "answer" },
        ],
      },
      {
        role: "assistant",
        content:
          '<caide-compaction title="Conversation compacted" state="finished">\nsummary\n</caide-compaction>',
      },
    ];
    const result = ensureReasoningConsistency(messages);
    const summary = result[1] as { content: Array<Record<string, unknown>> };
    // The original string content is preserved as a text part.
    expect(summary.content[0]).toEqual({
      type: "text",
      text: '<caide-compaction title="Conversation compacted" state="finished">\nsummary\n</caide-compaction>',
    });
    // The sentinel reasoning part must be present and non-empty so the SDK emits
    // reasoning_content (guarded by a length check) for the reasoning-less message.
    const reasoning = summary.content.find((p) => p.type === "reasoning");
    expect(reasoning).toBeDefined();
    expect((reasoning as { text: string }).text.length).toBeGreaterThan(0);
  });

  it("does not modify non-assistant messages", () => {
    const messages: ModelMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: [{ type: "reasoning", text: "think" }],
      },
      { role: "tool", content: [] },
    ];
    const result = ensureReasoningConsistency(messages);
    expect(result[0]).toEqual({ role: "system", content: "sys" });
    expect(result[1]).toEqual({ role: "user", content: "hi" });
    expect(result[3]).toEqual({ role: "tool", content: [] });
  });

  it("converts a string-content assistant message to parts when injecting reasoning", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [{ type: "reasoning", text: "think" }],
      },
      { role: "assistant", content: "plain response" },
    ];
    const result = ensureReasoningConsistency(messages);
    expect(Array.isArray(result[1].content)).toBe(true);
    expect((result[1] as { content: Array<Record<string, unknown>> }).content[0]).toEqual({
      type: "text",
      text: "plain response",
    });
  });
});
