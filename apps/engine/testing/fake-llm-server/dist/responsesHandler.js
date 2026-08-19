"use strict";
/**
 * Handler for OpenAI Responses API (/v1/responses)
 * Implements the streaming SSE format for the Responses API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createResponsesHandler = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./index");
const log_1 = require("./log");
const paths_1 = require("./paths");
const consentClassifier_1 = require("./consentClassifier");
/**
 * Generate a dump file from the request and return the path marker
 */
function generateDump(req) {
    const timestamp = Date.now();
    const generatedDir = (0, paths_1.resolveDumpDir)();
    // Create generated directory if it doesn't exist
    if (!fs_1.default.existsSync(generatedDir)) {
        fs_1.default.mkdirSync(generatedDir, { recursive: true });
    }
    // Include a random suffix so parallel processes writing in the same
    // millisecond cannot collide on the dump filename (same scheme as
    // chatCompletionHandler.ts; the harness relies on names being unique and
    // lexically sortable by time).
    const dumpFilePath = path_1.default.join(generatedDir, `${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`);
    try {
        fs_1.default.writeFileSync(dumpFilePath, JSON.stringify({
            body: req.body,
            headers: { authorization: req.headers["authorization"] },
        }, null, 2).replace(/\r\n/g, "\n"), "utf-8");
        console.log(`* [responses] Dumped messages to: ${dumpFilePath}`);
        return `[[dyad-dump-path=${dumpFilePath}]]`;
    }
    catch (error) {
        console.error(`* [responses] Error writing dump file: ${error}`);
        return `Error: Could not write dump file: ${error}`;
    }
}
/**
 * Extract text content from the Responses API input format
 */
function extractTextFromInput(input) {
    // Responses API accepts `input` as a string or a list of structured items.
    if (typeof input === "string")
        return input;
    if (!Array.isArray(input))
        return "";
    for (const item of input.slice().reverse()) {
        if (item?.role === "user" && typeof item?.content === "string") {
            return item.content;
        }
        if (item?.role === "user" && Array.isArray(item?.content)) {
            // Try common part types used by clients.
            for (const part of item.content) {
                if (part?.type === "input_text" && typeof part?.text === "string") {
                    return part.text;
                }
                if (part?.type === "text" && typeof part?.text === "string") {
                    return part.text;
                }
            }
        }
    }
    return "";
}
function extractTextFromMessages(messages) {
    if (!Array.isArray(messages))
        return "";
    for (const msg of messages.slice().reverse()) {
        if (msg?.role !== "user")
            continue;
        if (typeof msg?.content === "string")
            return msg.content;
        if (Array.isArray(msg?.content)) {
            for (const part of msg.content) {
                if (part?.type === "text" && typeof part?.text === "string") {
                    return part.text;
                }
            }
        }
    }
    return "";
}
function extractTestCaseName(promptText) {
    // Matches:
    // - "tc=foo"
    // - "[dump] tc=foo"
    // Stops at "[" to mimic existing fixture naming convention.
    const m = promptText.match(/(?:^|\s)tc=([^[]+)/);
    if (!m)
        return null;
    return m[1].trim().split(/\s+/)[0] || null;
}
/**
 * Create SSE event string
 */
function createSSEEvent(eventType, data) {
    return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}
/**
 * Create the Responses API handler
 */
const createResponsesHandler = (prefix) => async (req, res) => {
    const { input, messages, stream = false } = req.body ?? {};
    (0, log_1.fakeLlmLog)(`* [responses/${prefix}] Received request`, {
        hasInput: input != null,
        hasMessages: Array.isArray(messages),
        stream: Boolean(stream),
    });
    // Extract the last user message text (best-effort)
    const lastUserText = input != null
        ? extractTextFromInput(input)
        : extractTextFromMessages(messages);
    // Determine the response content
    let messageContent = index_1.CANNED_MESSAGE;
    // Check if the last message contains "[429]" to simulate rate limiting
    if (lastUserText.trim() === "[429]") {
        return res.status(429).json({
            error: {
                message: "Too many requests. Please try again later.",
                type: "rate_limit_error",
                param: null,
                code: "rate_limit_exceeded",
            },
        });
    }
    // Load a fixture file when the prompt includes tc=<name>
    const testCaseName = extractTestCaseName(lastUserText);
    if (testCaseName && !testCaseName.startsWith("local-agent/")) {
        const testFilePath = path_1.default.join((0, paths_1.resolveFixturesDir)(), prefix, `${testCaseName}.md`);
        try {
            messageContent = fs_1.default
                .readFileSync(testFilePath, "utf-8")
                .replace(/\r\n/g, "\n");
        }
        catch (error) {
            console.error(`* [responses/${prefix}] Error reading test file`, error);
            messageContent = `Error: Could not read test file: ${testCaseName}`;
        }
    }
    // Check if the message contains "[dump]" to generate a dump
    if (lastUserText.includes("[dump]")) {
        messageContent = generateDump(req);
    }
    // See consentClassifier.ts: fake decisions for the MCP auto-consent
    // classifier, shared with the chat-completions fake route.
    const consentMatch = (0, consentClassifier_1.matchConsentClassifierPayload)(lastUserText);
    if (consentMatch) {
        messageContent = consentMatch.content;
        // Answer slowly for print_envs so e2e can observe the "AI reviewing"
        // spinner and exercise the user-decides-before-the-AI path. Race the delay
        // against the client disconnecting so we don't write to a closed response.
        if (consentMatch.toolName === consentClassifier_1.SLOW_CONSENT_TOOL) {
            await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    req.off("close", onClose);
                    resolve();
                }, 4000);
                const onClose = () => {
                    clearTimeout(timer);
                    resolve();
                };
                req.on("close", onClose);
            });
            if (req.destroyed)
                return;
        }
    }
    const responseId = `resp_${Date.now()}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const model = req.body?.model || "fake-model";
    const baseResponseFields = {
        id: responseId,
        object: "response",
        created_at: createdAt,
        model,
        error: null,
        incomplete_details: null,
        instructions: req.body?.instructions ?? null,
        metadata: req.body?.metadata ?? null,
        parallel_tool_calls: req.body?.parallel_tool_calls ?? true,
        temperature: req.body?.temperature ?? null,
        tool_choice: req.body?.tool_choice ?? "auto",
        tools: req.body?.tools ?? [],
        top_p: req.body?.top_p ?? null,
    };
    const mkUsage = () => ({
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: Math.max(1, Math.ceil(messageContent.length / 4)),
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 10 + Math.max(1, Math.ceil(messageContent.length / 4)),
    });
    // Non-streaming response
    if (!stream) {
        const outputItem = {
            id: `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
                {
                    type: "output_text",
                    text: messageContent,
                    annotations: [],
                },
            ],
        };
        return res.json({
            ...baseResponseFields,
            output_text: messageContent,
            output: [outputItem],
            status: "completed",
            usage: mkUsage(),
        });
    }
    // Streaming response using SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    let sequence = 0;
    const nextSeq = () => sequence++;
    const outputItemId = `msg_${Date.now()}`;
    const emptyTextPart = {
        type: "output_text",
        text: "",
        annotations: [],
    };
    // 1. response.created
    res.write(createSSEEvent("response.created", {
        type: "response.created",
        sequence_number: nextSeq(),
        response: {
            ...baseResponseFields,
            output_text: "",
            output: [],
            status: "in_progress",
        },
    }));
    // 2. response.output_item.added
    res.write(createSSEEvent("response.output_item.added", {
        type: "response.output_item.added",
        output_index: 0,
        sequence_number: nextSeq(),
        item: {
            id: outputItemId,
            type: "message",
            role: "assistant",
            status: "in_progress",
            content: [],
        },
    }));
    // 3. response.content_part.added
    res.write(createSSEEvent("response.content_part.added", {
        type: "response.content_part.added",
        output_index: 0,
        item_id: outputItemId,
        content_index: 0,
        sequence_number: nextSeq(),
        part: emptyTextPart,
    }));
    // 4. Stream the text content in chunks
    const chars = messageContent.split("");
    const batchSize = 32;
    for (let i = 0; i < chars.length; i += batchSize) {
        const batch = chars.slice(i, i + batchSize).join("");
        res.write(createSSEEvent("response.output_text.delta", {
            type: "response.output_text.delta",
            output_index: 0,
            content_index: 0,
            item_id: outputItemId,
            sequence_number: nextSeq(),
            delta: batch,
        }));
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // 5. response.output_text.done
    res.write(createSSEEvent("response.output_text.done", {
        type: "response.output_text.done",
        output_index: 0,
        content_index: 0,
        item_id: outputItemId,
        sequence_number: nextSeq(),
        text: messageContent,
    }));
    // 6. response.content_part.done
    res.write(createSSEEvent("response.content_part.done", {
        type: "response.content_part.done",
        output_index: 0,
        content_index: 0,
        item_id: outputItemId,
        sequence_number: nextSeq(),
        part: {
            type: "output_text",
            text: messageContent,
            annotations: [],
        },
    }));
    // 7. response.output_item.done
    res.write(createSSEEvent("response.output_item.done", {
        type: "response.output_item.done",
        output_index: 0,
        sequence_number: nextSeq(),
        item: {
            id: outputItemId,
            type: "message",
            role: "assistant",
            status: "completed",
            content: [
                {
                    type: "output_text",
                    text: messageContent,
                    annotations: [],
                },
            ],
        },
    }));
    // 8. response.completed
    const completedOutputItem = {
        id: outputItemId,
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
            {
                type: "output_text",
                text: messageContent,
                annotations: [],
            },
        ],
    };
    res.write(createSSEEvent("response.completed", {
        type: "response.completed",
        sequence_number: nextSeq(),
        response: {
            ...baseResponseFields,
            output_text: messageContent,
            output: [completedOutputItem],
            status: "completed",
            usage: mkUsage(),
        },
    }));
    // Match the general OpenAI streaming convention.
    res.write("data: [DONE]\n\n");
    res.end();
};
exports.createResponsesHandler = createResponsesHandler;
