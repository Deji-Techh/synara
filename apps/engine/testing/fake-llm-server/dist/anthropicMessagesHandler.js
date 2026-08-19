"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnthropicMessagesHandler = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const chatCompletionHandler_1 = require("./chatCompletionHandler");
const paths_1 = require("./paths");
const localAgentHandler_1 = require("./localAgentHandler");
const exploreCodeFixtures_1 = require("./exploreCodeFixtures");
const log_1 = require("./log");
const CANNED_MESSAGE = `
  <dyad-write path="file1.txt">
  A file (2)
  </dyad-write>
  More
  EOM`;
function getTextContent(message) {
    if (typeof message?.content === "string") {
        return message.content;
    }
    if (Array.isArray(message?.content)) {
        return message.content
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n");
    }
    return "";
}
function isToolResultMessage(message) {
    return (Array.isArray(message?.content) &&
        message.content.some((part) => part.type === "tool_result"));
}
function getLastRealUserMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.role === "user" && !isToolResultMessage(message)) {
            return message;
        }
    }
    return undefined;
}
function hasExploreCodeToolResult(messages) {
    return messages.some((message) => {
        if (!isToolResultMessage(message)) {
            return false;
        }
        const text = getTextContent(message);
        return (text.includes("Found ") ||
            text.includes("Code exploration:") ||
            text.includes("src/App.tsx"));
    });
}
function getLatestMatchingUserText(messages, predicate) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.role !== "user" || isToolResultMessage(message)) {
            continue;
        }
        const text = getTextContent(message);
        if (predicate(text)) {
            return text;
        }
    }
    return undefined;
}
function isSyntheticContinuationUserText(text) {
    return (text.includes("incomplete todo(s)") ||
        text.includes("unfinished todos from your previous turn") ||
        text.includes("previous response stream was interrupted") ||
        text.includes("did not finish completely"));
}
function findOriginalLocalAgentFixture(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message?.role !== "user" || isToolResultMessage(message)) {
            continue;
        }
        const textContent = getTextContent(message);
        const fixture = (0, localAgentHandler_1.extractLocalAgentFixture)(textContent) ??
            textContent.match(/tc=local-agent\/([^\s"\\]+)/)?.[1] ??
            JSON.stringify(message.content).match(/tc=local-agent\/([^\s"\\]+)/)?.[1];
        if (fixture) {
            return fixture;
        }
    }
    return null;
}
function writeEvent(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function sendJsonMessage(res, req, text) {
    res.json({
        type: "message",
        id: `msg_${Date.now()}`,
        role: "assistant",
        model: req.body?.model ?? "fake-anthropic-model",
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
            input_tokens: 1,
            output_tokens: 1,
        },
    });
}
function sendJsonToolUseMessage(res, req, toolName, input) {
    res.json({
        type: "message",
        id: `msg_${Date.now()}`,
        role: "assistant",
        model: req.body?.model ?? "fake-anthropic-model",
        content: [
            {
                type: "tool_use",
                id: `call_${Date.now()}`,
                name: toolName,
                input,
            },
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: {
            input_tokens: 1,
            output_tokens: 1,
        },
    });
}
async function streamTextMessage(res, req, text) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    writeEvent(res, "message_start", {
        type: "message_start",
        message: {
            id: `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            model: req.body?.model ?? "fake-anthropic-model",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
        },
    });
    writeEvent(res, "content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
    });
    const batchSize = 32;
    for (let i = 0; i < text.length; i += batchSize) {
        writeEvent(res, "content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: text.slice(i, i + batchSize) },
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    writeEvent(res, "content_block_stop", {
        type: "content_block_stop",
        index: 0,
    });
    writeEvent(res, "message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
    });
    writeEvent(res, "message_stop", { type: "message_stop" });
    res.end();
}
async function streamToolUseMessage(res, req, toolName, input) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    writeEvent(res, "message_start", {
        type: "message_start",
        message: {
            id: `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            model: req.body?.model ?? "fake-anthropic-model",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
        },
    });
    writeEvent(res, "content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
            type: "tool_use",
            id: `call_${Date.now()}`,
            name: toolName,
            input: {},
        },
    });
    const inputText = JSON.stringify(input);
    const batchSize = 20;
    for (let index = 0; index < inputText.length; index += batchSize) {
        writeEvent(res, "content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: {
                type: "input_json_delta",
                partial_json: inputText.slice(index, index + batchSize),
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    writeEvent(res, "content_block_stop", {
        type: "content_block_stop",
        index: 0,
    });
    writeEvent(res, "message_delta", {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { input_tokens: 1, output_tokens: 1 },
    });
    writeEvent(res, "message_stop", { type: "message_stop" });
    res.end();
}
const createAnthropicMessagesHandler = (prefix) => async (req, res) => {
    const { messages = [], stream = false } = req.body ?? {};
    (0, log_1.fakeLlmLog)(`* [anthropic/${prefix}] Received messages`, messages);
    const userMessages = Array.isArray(messages)
        ? messages.filter((m) => m.role === "user")
        : [];
    const lastUserMessage = getLastRealUserMessage(messages);
    const userTextContent = getTextContent(lastUserMessage);
    let localAgentFixture = (0, localAgentHandler_1.extractLocalAgentFixture)(userTextContent);
    const lastMessage = Array.isArray(messages)
        ? messages[messages.length - 1]
        : undefined;
    if (!localAgentFixture &&
        (isToolResultMessage(lastMessage) ||
            isSyntheticContinuationUserText(userTextContent))) {
        localAgentFixture = findOriginalLocalAgentFixture(userMessages);
    }
    if (getLatestMatchingUserText(messages, (text) => text.includes("I accept this plan"))) {
        return (0, localAgentHandler_1.handleLocalAgentFixture)(req, res, "exit-plan", {
            protocol: "anthropic",
        });
    }
    let messageContent = CANNED_MESSAGE;
    const planCommentsMessage = getLatestMatchingUserText(messages, (text) => text.includes("I have the following comments on the plan"));
    if (planCommentsMessage) {
        messageContent =
            "I'll update the plan based on your comments.\n\n" + (0, chatCompletionHandler_1.generateDump)(req);
    }
    if (userTextContent.includes("[dump]")) {
        messageContent = (0, chatCompletionHandler_1.generateDump)(req);
    }
    if (userTextContent.startsWith("/security-review")) {
        messageContent =
            fs_1.default
                .readFileSync(path_1.default.join((0, paths_1.resolveFixturesDir)(), "security-review", "findings.md"), "utf-8")
                .replace(/\r\n/g, "\n") +
                "\n\n" +
                (0, chatCompletionHandler_1.generateDump)(req);
    }
    if (userTextContent.startsWith("Please summarize the following conversation:")) {
        messageContent =
            "## Key Decisions Made\n- Completed initial task as requested\n\n## Current Task State\nConversation was compacted to save context space.";
    }
    if ((0, exploreCodeFixtures_1.isExploreCodeSubagentPrompt)(userTextContent)) {
        const toolName = hasExploreCodeToolResult(messages)
            ? "submit_report"
            : "explore_code";
        const input = toolName === "submit_report"
            ? (0, exploreCodeFixtures_1.buildExploreCodeSubmitReportArgs)()
            : (0, exploreCodeFixtures_1.buildExploreCodeNestedToolArgs)();
        if (stream) {
            await streamToolUseMessage(res, req, toolName, input);
            return;
        }
        sendJsonToolUseMessage(res, req, toolName, input);
        return;
    }
    if (localAgentFixture &&
        messageContent === CANNED_MESSAGE &&
        !userTextContent.includes("I have the following comments on the plan")) {
        return (0, localAgentHandler_1.handleLocalAgentFixture)(req, res, localAgentFixture, {
            protocol: "anthropic",
        });
    }
    if (stream) {
        await streamTextMessage(res, req, messageContent);
        return;
    }
    sendJsonMessage(res, req, messageContent);
};
exports.createAnthropicMessagesHandler = createAnthropicMessagesHandler;
