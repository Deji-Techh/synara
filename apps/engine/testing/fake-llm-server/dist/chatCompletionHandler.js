"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatCompletionHandler = void 0;
exports.generateDump = generateDump;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./index");
const localAgentHandler_1 = require("./localAgentHandler");
const exploreCodeFixtures_1 = require("./exploreCodeFixtures");
const log_1 = require("./log");
const paths_1 = require("./paths");
const consentClassifier_1 = require("./consentClassifier");
let globalCounter = 0;
function hasInvalidApiKey(req) {
    const authorization = req.headers.authorization;
    return typeof authorization === "string" && /invalid/i.test(authorization);
}
function hasExploreCodeToolResult(messages, getTextContent) {
    return messages.some((message) => {
        if (message?.role !== "tool") {
            return false;
        }
        const text = getTextContent(message);
        return (text.includes("Found ") ||
            text.includes("Code exploration:") ||
            text.includes("src/App.tsx"));
    });
}
function sendToolCallJson(res, toolName, args) {
    res.json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "fake-model",
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: `call_${Date.now()}`,
                            type: "function",
                            function: {
                                name: toolName,
                                arguments: JSON.stringify(args),
                            },
                        },
                    ],
                },
                finish_reason: "tool_calls",
            },
        ],
    });
}
async function streamToolCall(res, toolName, args) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const now = Date.now();
    const mkChunk = (delta, finish = null) => `data: ${JSON.stringify({
        id: `chatcmpl-${now}`,
        object: "chat.completion.chunk",
        created: Math.floor(now / 1000),
        model: "fake-model",
        choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
    res.write(mkChunk({ role: "assistant" }));
    res.write(mkChunk({
        tool_calls: [
            {
                index: 0,
                id: `call_${now}`,
                type: "function",
                function: { name: toolName, arguments: "" },
            },
        ],
    }));
    const argsText = JSON.stringify(args);
    const batchSize = 20;
    for (let index = 0; index < argsText.length; index += batchSize) {
        res.write(mkChunk({
            tool_calls: [
                {
                    index: 0,
                    function: { arguments: argsText.slice(index, index + batchSize) },
                },
            ],
        }));
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    res.write(mkChunk({}, "tool_calls"));
    res.write("data: [DONE]\n\n");
    res.end();
}
const createChatCompletionHandler = (prefix) => async (req, res) => {
    const { stream = false, messages = [] } = req.body;
    (0, log_1.fakeLlmLog)("* Received messages", messages);
    if (hasInvalidApiKey(req)) {
        // The Dyad engine (a LiteLLM proxy) reports auth failures as an SSE
        // error event on an HTTP 200 response rather than an HTTP 401.
        if (prefix === "engine") {
            res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache");
            res.write(`event: error\ndata: ${JSON.stringify({
                error: {
                    message: "401 LiteLLM Virtual Key expected. Received=inva****-key, expected to start with 'sk-'.",
                    type: "server_error",
                    param: null,
                },
            })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
            return;
        }
        return res.status(401).json({
            error: {
                message: "Invalid API key",
                type: "authentication_error",
                param: null,
                code: "invalid_api_key",
            },
        });
    }
    // Check if the last message contains "[429]" to simulate rate limiting
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.content === "[429]") {
        return res.status(429).json({
            error: {
                message: "Too many requests. Please try again later.",
                type: "rate_limit_error",
                param: null,
                code: "rate_limit_exceeded",
            },
        });
    }
    // Check for local-agent fixture requests (tc=local-agent/*)
    // We need to check ALL user messages, not just the last one, because
    // outer loop follow-up requests inject a todo reminder as the last user message.
    // The fixture trigger (tc=local-agent/...) will be in an earlier user message.
    const userMessages = messages.filter((m) => m.role === "user");
    // Helper to extract text content from a message (handles both string and array content)
    const getTextContent = (msg) => {
        if (typeof msg.content === "string") {
            return msg.content;
        }
        else if (Array.isArray(msg.content)) {
            const textPart = msg.content.find((p) => p.type === "text");
            return textPart ? textPart.text : "";
        }
        return "";
    };
    // Get the last user message's text content for other checks
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userTextContent = lastUserMessage
        ? getTextContent(lastUserMessage)
        : "";
    // First, check if the LAST user message is a fixture trigger
    let localAgentFixture = (0, localAgentHandler_1.extractLocalAgentFixture)(userTextContent);
    // If the last user message is synthetic (e.g., todo reminder or retry
    // continuation instruction), search earlier user messages for the original
    // fixture trigger.
    if (!localAgentFixture &&
        (userTextContent.includes("incomplete todo(s)") ||
            userTextContent.includes("previous response stream was interrupted") ||
            userTextContent.includes("did not finish completely"))) {
        for (const msg of userMessages) {
            const textContent = getTextContent(msg);
            const fixture = (0, localAgentHandler_1.extractLocalAgentFixture)(textContent);
            if (fixture) {
                localAgentFixture = fixture;
                break; // Use the first (original) fixture trigger found
            }
        }
    }
    (0, log_1.fakeLlmLog)(`[local-agent] Checking message: "${userTextContent.slice(0, 50)}", fixture: ${localAgentFixture}`);
    if (localAgentFixture) {
        return (0, localAgentHandler_1.handleLocalAgentFixture)(req, res, localAgentFixture);
    }
    // Route plan acceptance message to exit-plan fixture
    if (userTextContent.includes("I accept this plan")) {
        return (0, localAgentHandler_1.handleLocalAgentFixture)(req, res, "exit-plan");
    }
    let messageContent = index_1.CANNED_MESSAGE;
    // Checkpoint chain pass prompts (build mode). The chain appends a
    // synthetic "[System] Checkpoint pass: <id>." user message after the
    // accumulated assistant response. Respond deterministically with a
    // marker naming the pass so tests can assert which passes ran.
    const checkpointPassMatch = userTextContent.match(/Checkpoint pass: ([a-z-]+?)\./);
    if (checkpointPassMatch?.[1]) {
        (0, log_1.fakeLlmLog)(`[checkpoint-pass] pass=${checkpointPassMatch[1]}, last message: "${userTextContent.slice(0, 80)}"`);
        messageContent = `[checkpoint-pass:${checkpointPassMatch[1]}] I've inspected the app and this pass contract is already satisfied; no changes were needed.`;
    }
    // Route plan comment messages to generate dump for testing
    if (userTextContent.includes("I have the following comments on the plan")) {
        messageContent =
            "I'll update the plan based on your comments.\n\n" + generateDump(req);
    }
    // Handle compaction summary requests (from generateText() in compaction_handler)
    if (userTextContent.startsWith("Please summarize the following conversation:")) {
        messageContent =
            "## Key Decisions Made\n- Completed initial task as requested\n\n## Current Task State\nConversation was compacted to save context space.";
    }
    if ((0, exploreCodeFixtures_1.isExploreCodeSubagentPrompt)(userTextContent)) {
        const toolName = hasExploreCodeToolResult(messages, getTextContent)
            ? "submit_report"
            : "explore_code";
        const input = toolName === "submit_report"
            ? (0, exploreCodeFixtures_1.buildExploreCodeSubmitReportArgs)()
            : (0, exploreCodeFixtures_1.buildExploreCodeNestedToolArgs)();
        if (stream) {
            await streamToolCall(res, toolName, input);
            return;
        }
        sendToolCallJson(res, toolName, input);
        return;
    }
    // Check for upload image to codebase using lastUserMessage (which already handles both string and array content)
    if (userTextContent.includes("[[UPLOAD_IMAGE_TO_CODEBASE]]")) {
        // Extract the attachment path from the user message (format: "path: /path/to/app/.dyad/media/...")
        const pathMatch = userTextContent.match(/\(path: ([^\s)]+)\)/);
        const attachmentPath = pathMatch?.[1] ?? ".dyad/media/unknown.png";
        messageContent = `Uploading image to codebase
<dyad-copy from="${attachmentPath}" to="new/image/file.png" description="Uploaded image to codebase"></dyad-copy>
`;
        messageContent += "\n\n" + generateDump(req);
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.includes("[sleep=medium]")) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.includes("[sleep=long]")) {
        await new Promise((resolve) => setTimeout(resolve, 30000));
    }
    // Handle merge conflict resolution prompts (both old and new formats)
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        (lastMessage.content.includes("Resolve the Git conflict(s) in ") ||
            lastMessage.content.includes("Please resolve the Git merge conflicts in the following file"))) {
        // Extract conflict file path from different prompt formats
        let conflictPath = "conflict.txt";
        if (lastMessage.content.includes("Resolve the Git conflict(s) in ")) {
            conflictPath =
                lastMessage.content
                    .split("Resolve the Git conflict(s) in ")[1]
                    ?.split("\n")[0]
                    ?.replace(/\.$/, "")
                    .trim() || "conflict.txt";
        }
        else {
            // New format: "Please resolve the Git merge conflicts in the following file(s):\n\n- conflict.txt"
            const fileListMatch = lastMessage.content.match(/^- (.+)$/m);
            if (fileListMatch) {
                conflictPath = fileListMatch[1].trim();
            }
        }
        messageContent = `Resolved conflicts in ${conflictPath}.
<dyad-write path="${conflictPath}" description="Resolve merge conflicts.">
Line 1
Line 2 Modified Feature
Line 3
</dyad-write>
`;
    }
    // TS auto-fix prefixes
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("Fix these 2 TypeScript compile-time error")) {
        // Fix errors in create-ts-errors.md and introduce a new error
        messageContent = `
<dyad-write path="src/bad-file.ts" description="Fix 2 errors and introduce a new error.">
// Import doesn't exist
// import NonExistentClass from 'non-existent-class';


const x = new Object();
x.nonExistentMethod2();
</dyad-write>

      `;
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("Fix these 1 TypeScript compile-time error")) {
        // Fix errors in create-ts-errors.md and introduce a new error
        messageContent = `
<dyad-write path="src/bad-file.ts" description="Fix remaining error.">
// Import doesn't exist
// import NonExistentClass from 'non-existent-class';


const x = new Object();
x.toString(); // replaced with existing method
</dyad-write>

      `;
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.includes("TypeScript compile-time error")) {
        messageContent += "\n\n" + generateDump(req);
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("Fix error: Error Line 6 error")) {
        messageContent = `
      Fixing the error...
      <dyad-write path="src/pages/Index.tsx">
      

import { MadeWithDyad } from "@/components/made-with-dyad";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">No more errors!</h1>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;

      </dyad-write>
      `;
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("There was an issue with the following `dyad-search-replace` tags.")) {
        if (lastMessage.content.includes("Make sure you use `dyad-read`")) {
            // Fix errors in create-ts-errors.md and introduce a new error
            messageContent =
                `
<dyad-read path="src/pages/Index.tsx"></dyad-read>

<dyad-search-replace path="src/pages/Index.tsx">
<<<<<<< SEARCH
        // STILL Intentionally DO NOT MATCH ANYTHING TO TRIGGER FALLBACK
        <h1 className="text-4xl font-bold mb-4">Welcome to Your Blank App</h1>
=======
        <h1 className="text-4xl font-bold mb-4">Welcome to the UPDATED App</h1>
>>>>>>> REPLACE
</dyad-search-replace>
` +
                    "\n\n" +
                    generateDump(req);
        }
        else {
            // Fix errors in create-ts-errors.md and introduce a new error
            messageContent =
                `
<dyad-write path="src/pages/Index.tsx" description="Rewrite file.">
// FILE IS REPLACED WITH FALLBACK WRITE.
</dyad-write>` +
                    "\n\n" +
                    generateDump(req);
        }
    }
    (0, log_1.fakeLlmLog)("LASTMESSAGE", lastMessage);
    // Check if the last message is "[dump]" to write messages to file and return path
    if (lastMessage &&
        (Array.isArray(lastMessage.content)
            ? lastMessage.content.some((part) => part.type === "text" && part.text.includes("[dump]"))
            : lastMessage.content.includes("[dump]"))) {
        messageContent = generateDump(req);
    }
    if (lastMessage &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("/security-review")) {
        messageContent = fs_1.default
            .readFileSync(path_1.default.join((0, paths_1.resolveFixturesDir)(), "security-review", "findings.md"), "utf-8")
            .replace(/\r\n/g, "\n");
        messageContent += "\n\n" + generateDump(req);
    }
    if (lastMessage && lastMessage.content === "[increment]") {
        globalCounter++;
        messageContent = `counter=${globalCounter}`;
    }
    // Check if the last message starts with "tc=" to load test case file
    if (lastMessage &&
        lastMessage.content &&
        typeof lastMessage.content === "string" &&
        lastMessage.content.startsWith("tc=") &&
        !lastMessage.content.startsWith("tc=local-agent/")) {
        const testCaseName = lastMessage.content.slice(3).split("[")[0].trim(); // Remove "tc=" prefix
        (0, log_1.fakeLlmLog)(`* Loading test case: ${testCaseName}`);
        const testFilePath = path_1.default.join((0, paths_1.resolveFixturesDir)(), prefix, `${testCaseName}.md`);
        try {
            if (fs_1.default.existsSync(testFilePath)) {
                messageContent = fs_1.default
                    .readFileSync(testFilePath, "utf-8")
                    .replace(/\r\n/g, "\n");
                (0, log_1.fakeLlmLog)(`* Loaded test case: `);
            }
            else {
                console.error(`* Test case file not found: ${testFilePath}`);
                messageContent = `Error: Test case file not found: ${testCaseName}.md`;
            }
        }
        catch (error) {
            console.error(`* Error reading test case file: ${error}`);
            messageContent = `Error: Could not read test case file: ${testCaseName}.md`;
        }
    }
    // Continuation requests: the partial assistant output is in a preceding assistant
    // message, then a user message asks to continue ("did not finish completely").
    // Check any message for the marker. See chat_stream_handlers continuation prompt.
    if (messages.some((m) => getTextContent(m).includes("[[STRING_TO_BE_FINISHED]]"))) {
        messageContent = `[[STRING_IS_FINISHED]]";</dyad-write>\nFinished writing file.`;
        messageContent += "\n\n" + generateDump(req);
    }
    // See consentClassifier.ts: fake decisions for the MCP auto-consent
    // classifier, shared with the responses fake route.
    const lastUserText = lastMessage ? getTextContent(lastMessage) : "";
    const consentMatch = (0, consentClassifier_1.matchConsentClassifierPayload)(lastUserText);
    if (consentMatch) {
        messageContent = consentMatch.content;
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
    const isToolCall = !!(lastMessage &&
        lastMessage.content &&
        lastMessage.content.includes("[call_tool=calculator_add]"));
    // Emit two parallel tool calls (slow first, fast second) so their results
    // land out of order. See mcp_out_of_order.spec.ts.
    const isParallelOutOfOrderToolCall = !!(lastMessage &&
        lastMessage.content &&
        lastMessage.content.includes("[call_tools_out_of_order]"));
    let message = {
        role: "assistant",
        content: messageContent,
    };
    // Non-streaming response
    if (!stream) {
        if (isToolCall) {
            const toolCallId = `call_${Date.now()}`;
            return res.json({
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: "fake-model",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            tool_calls: [
                                {
                                    id: toolCallId,
                                    type: "function",
                                    function: {
                                        name: "calculator_add",
                                        arguments: JSON.stringify({ a: 1, b: 2 }),
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
            });
        }
        return res.json({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "fake-model",
            choices: [
                {
                    index: 0,
                    message,
                    finish_reason: "stop",
                },
            ],
        });
    }
    // Streaming response
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // Two parallel tool calls in a single assistant message (slow + fast).
    // The AI SDK runs the executes concurrently, so the fast tool's result
    // streams back before the slow tool's.
    if (isParallelOutOfOrderToolCall) {
        const now = Date.now();
        const mkChunk = (delta, finish = null) => {
            const chunk = {
                id: `chatcmpl-${now}`,
                object: "chat.completion.chunk",
                created: Math.floor(now / 1000),
                model: "fake-model",
                choices: [{ index: 0, delta, finish_reason: finish }],
            };
            return `data: ${JSON.stringify(chunk)}\n\n`;
        };
        res.write(mkChunk({ role: "assistant" }));
        res.write(mkChunk({
            tool_calls: [
                {
                    index: 0,
                    id: `call_${now}_slow`,
                    type: "function",
                    function: {
                        name: "testing-mcp-server__slow_add",
                        arguments: JSON.stringify({ a: 10, b: 20 }),
                    },
                },
                {
                    index: 1,
                    id: `call_${now}_fast`,
                    type: "function",
                    function: {
                        name: "testing-mcp-server__calculator_add",
                        arguments: JSON.stringify({ a: 1, b: 2 }),
                    },
                },
            ],
        }));
        res.write(mkChunk({}, "tool_calls"));
        res.write("data: [DONE]\n\n");
        res.end();
        return;
    }
    // Tool call streaming (OpenAI-style)
    if (isToolCall) {
        const now = Date.now();
        const mkChunk = (delta, finish = null) => {
            const chunk = {
                id: `chatcmpl-${now}`,
                object: "chat.completion.chunk",
                created: Math.floor(now / 1000),
                model: "fake-model",
                choices: [
                    {
                        index: 0,
                        delta,
                        finish_reason: finish,
                    },
                ],
            };
            return `data: ${JSON.stringify(chunk)}\n\n`;
        };
        // 1) Send role
        res.write(mkChunk({ role: "assistant" }));
        // 2) Send tool_calls init with id + name + empty args
        const toolCallId = `call_${now}`;
        res.write(mkChunk({
            tool_calls: [
                {
                    index: 0,
                    id: toolCallId,
                    type: "function",
                    function: {
                        name: "testing-mcp-server__calculator_add",
                        arguments: "",
                    },
                },
            ],
        }));
        // 3) Stream arguments gradually
        const args = JSON.stringify({ a: 1, b: 2 });
        let i = 0;
        const argBatchSize = 6;
        const argInterval = setInterval(() => {
            if (i < args.length) {
                const part = args.slice(i, i + argBatchSize);
                i += argBatchSize;
                res.write(mkChunk({
                    tool_calls: [{ index: 0, function: { arguments: part } }],
                }));
            }
            else {
                // 4) Finalize with finish_reason tool_calls and [DONE]
                res.write(mkChunk({}, "tool_calls"));
                res.write("data: [DONE]\n\n");
                clearInterval(argInterval);
                res.end();
            }
        }, 10);
        return;
    }
    // Check for high token usage marker to simulate near context limit
    const highTokensMatch = typeof lastMessage?.content === "string" &&
        !lastMessage?.content.startsWith("Summarize the following chat:") &&
        lastMessage?.content?.match?.(/\[high-tokens=(\d+)\]/);
    const highTokensValue = highTokensMatch
        ? parseInt(highTokensMatch[1], 10)
        : null;
    // Split the message into characters to simulate streaming
    const messageChars = messageContent.split("");
    // Stream each character with a delay
    let index = 0;
    const batchSize = 32;
    // Send role first
    res.write((0, index_1.createStreamChunk)("", "assistant"));
    const interval = setInterval(() => {
        if (index < messageChars.length) {
            // Get the next batch of characters (up to batchSize)
            const batch = messageChars.slice(index, index + batchSize).join("");
            res.write((0, index_1.createStreamChunk)(batch));
            index += batchSize;
        }
        else {
            // Send the final chunk with optional usage info for high token simulation
            const usage = highTokensValue
                ? {
                    prompt_tokens: highTokensValue - 100,
                    completion_tokens: 100,
                    total_tokens: highTokensValue,
                }
                : undefined;
            res.write((0, index_1.createStreamChunk)("", "assistant", true, usage));
            clearInterval(interval);
            res.end();
        }
    }, 10);
};
exports.createChatCompletionHandler = createChatCompletionHandler;
function generateDump(req) {
    const timestamp = Date.now();
    // The vitest chat-flow harness points FAKE_LLM_DUMP_DIR at a unique temp dir
    // so concurrent test files never share the dump folder. The standalone CLI
    // (Playwright) falls back to the historical ./generated location.
    const generatedDir = (0, paths_1.resolveDumpDir)();
    // Create generated directory if it doesn't exist
    if (!fs_1.default.existsSync(generatedDir)) {
        fs_1.default.mkdirSync(generatedDir, { recursive: true });
    }
    // Include a random suffix so parallel processes writing in the same
    // millisecond cannot collide on the dump filename.
    const dumpFilePath = path_1.default.join(generatedDir, `${timestamp}-${Math.random().toString(36).slice(2, 8)}.json`);
    try {
        fs_1.default.writeFileSync(dumpFilePath, JSON.stringify({
            body: req.body,
            headers: { authorization: req.headers["authorization"] },
        }, null, 2).replace(/\r\n/g, "\n"), "utf-8");
        console.log(`* Dumped messages to: ${dumpFilePath}`);
        return `[[dyad-dump-path=${dumpFilePath}]]`;
    }
    catch (error) {
        console.error(`* Error writing dump file: ${error}`);
        return `Error: Could not write dump file: ${error}`;
    }
}
