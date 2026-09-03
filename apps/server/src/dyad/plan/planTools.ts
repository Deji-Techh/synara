// FILE: planTools.ts
// Purpose: Planning-loop agent tools: questionnaire, plan write/exit, todos,
// env-var requests. Donor schemas/descriptions/consent levels kept verbatim.
// Electron/UI delivery is replaced by an injected PlanTransport (the WS layer
// provides it in M3); without one the human-gate tools fail structured
// instead of hanging. Plan drafts persist under <app>/.caide/plans/.
// Donor: dyad x caide tools/{planning_questionnaire,write_plan,exit_plan,
// update_todos,ask_env_vars}.ts.

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { applyTodoUpdate, type TodoStatus } from "./todoStore.ts";
import { nextRequestId, waitForUserInput } from "./userPrompt.ts";

export class PlanUiNotConnectedError extends Error {
  constructor(toolName: string) {
    super(
      `${toolName} needs the plan UI transport (WS layer wires it in M3) — no user can answer yet`,
    );
    this.name = "PlanUiNotConnectedError";
  }
}

export class PlanPreconditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanPreconditionError";
  }
}

export interface QuestionnaireItem {
  id?: string;
  question: string;
  type: "text" | "radio" | "checkbox";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

export interface EnvVarRequest {
  key: string;
  description?: string;
  instructionsUrl?: string;
}

export interface PlanTransport {
  sendQuestionnaire(sessionId: string, requestId: string, questions: QuestionnaireItem[]): void;
  sendEnvVarRequest(sessionId: string, requestId: string, vars: EnvVarRequest[]): void;
  sendPlanUpdate(sessionId: string, plan: { title: string; summary: string; plan: string }): void;
  sendPlanExit(sessionId: string): void;
}

let transport: PlanTransport | null = null;
export function setPlanTransport(t: PlanTransport | null): void {
  transport = t;
}
export function getPlanTransport(): PlanTransport | null {
  return transport;
}

function requireTransport(toolName: string): PlanTransport {
  if (!transport) throw new PlanUiNotConnectedError(toolName);
  return transport;
}

// --- planning_questionnaire (donor schema + description verbatim) ---

const QuestionSchema = z
  .object({
    id: z.string().optional().describe("Unique identifier for this question (auto-generated if omitted)"),
    question: z.string().describe("The question text to display to the user"),
    type: z.enum(["text", "radio", "checkbox"]).describe("text for free-form input, radio for single choice, checkbox for multiple choice"),
    options: z
      .array(z.string())
      .min(1)
      .max(3)
      .optional()
      .describe("Options for radio/checkbox questions. Keep to max 3 — users can always provide a custom answer via the free-form text input. Omit for text questions."),
    required: z.boolean().optional().describe("Whether this question requires an answer (defaults to true)"),
    placeholder: z.string().optional().describe("Placeholder text for text inputs"),
  })
  .refine((q) => q.type === "text" || (q.options && q.options.length >= 1), {
    message: "options are required for radio and checkbox questions",
    path: ["options"],
  });

const planningQuestionnaireSchema = z.object({
  questions: z
    .array(QuestionSchema)
    .min(1, "questions array must not be empty")
    .max(3, "questions array must have at most 3 questions")
    .describe("A non empty array of 1-3 questions to present to the user"),
});

export const planningQuestionnaireTool = defineTool({
  name: "planning_questionnaire",
  description: `Present a structured questionnaire to gather requirements from the user. The tool displays questions in the UI and waits for the user's responses, returning them as the tool result.

<when_to_use>
Use this tool when:
- The user wants to create a NEW app or project
- The request is vague or open-ended
- There are multiple reasonable interpretations
Skip when the request is a specific, concrete change.
</when_to_use>

<input_schema>
The tool accepts ONLY a "questions" array.

Each question object has these fields:
- "question" (string, REQUIRED): The question text shown to the user
- "type" (string, REQUIRED): One of "text", "radio", or "checkbox"
- "options" (string array, REQUIRED for radio/checkbox, OMIT for text): 1-3 predefined choices
- "id" (string, optional): Unique identifier, auto-generated if omitted
- "required" (boolean, optional): Defaults to true
- "placeholder" (string, optional): Placeholder for text inputs
</input_schema>

<correct_example>
Reasoning: The user asked to "build me a todo app". I need to clarify the tech stack and key features. I'll use radio for single-choice and checkbox for multi-choice.

{
  "questions": [
    {
      "type": "radio",
      "question": "What visual style do you prefer?",
      "options": ["Minimal & clean", "Colorful & playful", "Dark & modern"]
    },
    {
      "type": "checkbox",
      "question": "Which features do you want?",
      "options": ["Due dates", "Categories/tags", "Priority levels"]
    }
  ]
}
</correct_example>

<incorrect_examples>
WRONG — Empty questions array:
{ "questions": [] }

WRONG — options on text type:
{ "type": "text", "question": "...", "options": ["a"] }

WRONG — Empty options array:
{ "type": "radio", "question": "...", "options": [] }

WRONG — Missing options for radio:
{ "type": "radio", "question": "..." }

WRONG — More than 3 questions or more than 3 options

WRONG — Array with empty object (missing required "question" and "type" fields):
{ "questions": [{}] }
</incorrect_examples>`,
  schema: planningQuestionnaireSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeQuestionnaire(planningQuestionnaireSchema.parse(args), ctx.sessionId, ctx.signal),
  presentCall: (args: any) => `Questionnaire (${args.questions.length} questions)`,
});

export async function executeQuestionnaire(
  input: z.infer<typeof planningQuestionnaireSchema>,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = planningQuestionnaireSchema.parse(input);
  const t = requireTransport("planning_questionnaire");
  const requestId = nextRequestId("questionnaire");
  const questions: QuestionnaireItem[] = parsed.questions.map((q, i) => ({
    ...q,
    id: q.id || `q_${requestId.replace(/[^a-zA-Z0-9]/g, "").slice(-6)}${i}`,
  }));
  t.sendQuestionnaire(sessionId, requestId, questions);
  const answers = await waitForUserInput(requestId, sessionId, "questionnaire", signal);
  if (!answers) {
    return "The user dismissed the questionnaire without answering. Ask them how they'd like to proceed, or try asking questions in regular chat text.";
  }
  return questions.map((q) => `**${q.question}**\n${answers[q.id!] || "(no answer)"}`).join("\n\n");
}

// --- write_plan (donor schema + description verbatim) ---

const writePlanSchema = z.object({
  title: z.string().describe("Title of the implementation plan"),
  summary: z.string().describe("Brief summary (1-2 sentences) of what will be built"),
  plan: z
    .string()
    .describe("Full implementation plan in markdown format. Include sections for: feature overview, UI/UX design, considerations, technical approach, implementation steps, code changes, and testing strategy. Put product/UX sections first, technical sections last."),
});

export const writePlanTool = defineTool({
  name: "write_plan",
  description: `
Present an implementation plan to the user in the preview panel.

The plan should be comprehensive and include (in this order — product/UX first, technical last):
- **Overview**: Clear description of what will be built or changed
- **UI/UX Design**: User flows, layout, component placement, interactions
- **Considerations**: Potential challenges, trade-offs, edge cases, or alternatives
- **Technical Approach**: Architecture decisions, patterns to use, libraries needed
- **Implementation Steps**: Ordered, granular tasks with file-level specificity
- **Code Changes**: Specific files to modify/create and what changes are needed
- **Testing Strategy**: How the feature should be validated

Format the plan in markdown for clear readability. Use headers, bullet points, and code blocks for file paths.

After presenting the plan, the user can:
- Accept the plan (use exit_plan tool to proceed to implementation)
- Request changes (update the plan based on their feedback)

Example:
{
  "title": "User Authentication System",
  "summary": "Implement a complete authentication system with email/password login, session management, and protected routes.",
  "plan": "## Overview\\n\\nImplement a secure authentication system...\\n\\n## Technical Approach\\n\\n- Use JWT for session management...\\n\\n## Implementation Steps\\n\\n1. Create auth context...\\n2. Build login form...\\n\\n## Testing Strategy\\n\\n- Unit tests for auth hooks..."
}
`,
  schema: writePlanSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeWritePlan(writePlanSchema.parse(args), ctx.sessionId, ctx.appPath),
  presentCall: (args: any) => `Plan: ${args.title}`,
});

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "plan";
}

export async function executeWritePlan(
  input: z.infer<typeof writePlanSchema>,
  sessionId: string,
  appPath: string,
): Promise<string> {
  const parsed = writePlanSchema.parse(input);
  requireTransport("write_plan").sendPlanUpdate(sessionId, parsed);
  // Best-effort draft persistence (donor: savePlanToDisk) — a write failure
  // must not fail the tool call; the plan is still shown in-memory.
  try {
    const dir = path.join(appPath, ".caide", "plans");
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${slugify(parsed.title)}-${Date.now()}.md`);
    await fs.promises.writeFile(
      file,
      `---\ntitle: ${JSON.stringify(parsed.title)}\nstatus: draft\n---\n\n# ${parsed.title}\n\n${parsed.summary}\n\n${parsed.plan}\n`,
    );
  } catch {
    // ignore — shown in-memory regardless
  }
  return `Implementation plan "${parsed.title}" has been presented to the user. They can review it in the preview panel and either accept it or request changes.`;
}

// --- exit_plan (donor schema + description verbatim) ---

const exitPlanSchema = z.object({
  confirmation: z.boolean().describe("Whether the user has accepted the plan. Must be true to proceed."),
});

export const exitPlanTool = defineTool({
  name: "exit_plan",
  description: `
Exit planning mode after the user has accepted the implementation plan.

IMPORTANT: Only use this tool when:
1. A plan has been presented using the write_plan tool
2. The user has EXPLICITLY accepted the plan (said "yes", "accept", "looks good", etc.)
3. You are ready to begin implementation

This will:
- Switch to Agent mode for implementation
- Change the preview panel back to app preview
- Begin the implementation phase

Do NOT use this tool if:
- The user has requested changes to the plan
- The user has asked questions about the plan
- No plan has been presented yet

Example usage after user says "Looks good, let's build it!":
{
  "confirmation": true
}
`,
  schema: exitPlanSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeExitPlan(exitPlanSchema.parse(args), ctx.sessionId),
  presentCall: () => "Exit plan mode and start implementation",
});

export async function executeExitPlan(
  input: z.infer<typeof exitPlanSchema>,
  sessionId: string,
): Promise<string> {
  const parsed = exitPlanSchema.parse(input);
  if (!parsed.confirmation) {
    throw new PlanPreconditionError("User must confirm the plan before exiting plan mode");
  }
  requireTransport("exit_plan").sendPlanExit(sessionId);
  return "Plan accepted. Switching to Agent mode to begin implementation. The agreed plan will guide the implementation process.";
}

// --- update_todos (donor schema + description verbatim) ---

const todoSchema = z.object({
  id: z.string().describe("Unique identifier for the todo item"),
  content: z.string().optional().describe("The description/content of the todo item"),
  status: z.enum(["pending", "in_progress", "completed"]).optional().describe("The current status of the todo item"),
});

const updateTodosSchema = z.object({
  merge: z
    .boolean()
    .describe("Whether to merge the todos with the existing todos. If true, the todos will be merged into the existing todos based on the id field. You can leave unchanged properties undefined. If false, the new todos will replace the existing todos."),
  todos: z.array(todoSchema).describe("Array of todo items. When merge is true, only include todos that need updates. When merge is false, this is the complete list."),
});

export const updateTodosTool = defineTool({
  name: "update_todos",
  description: `
### When to Use This Tool

Use proactively for:
1. Complex multi-step tasks (3+ distinct steps)
2. Non-trivial tasks requiring careful planning
3. User explicitly requests todo list
4. User provides multiple tasks (numbered/comma-separated)
5. After completing tasks - mark complete with merge=true and add follow-ups
6. When starting new tasks - mark as in_progress (ideally only one at a time)

### When NOT to Use

Skip for:
1. Single, straightforward tasks
2. Trivial tasks with no organizational benefit
3. Tasks completable in < 3 trivial steps
4. Purely conversational/informational requests
5. Todo items should NOT include operational actions done in service of higher-level tasks.

NEVER INCLUDE THESE IN TODOS: linting; testing; searching or examining the codebase.

### Task States and Management

1. **Task States:**
- pending: Not yet started
- in_progress: Currently working on
- completed: Finished successfully

2. **Task Management:**
- Update status in real-time
- Mark complete IMMEDIATELY after finishing
- Only ONE task in_progress at a time
- Complete current tasks before starting new ones
`,
  schema: updateTodosSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = updateTodosSchema.parse(args);
    const next = applyTodoUpdate(ctx.sessionId, parsed.merge, parsed.todos as { id: string; content?: string; status?: TodoStatus }[]);
    const done = next.filter((t) => t.status === "completed").length;
    return `Todo list updated: ${done}/${next.length} completed.`;
  },
  presentCall: (args: any) => {
    const todos = args.todos ?? [];
    const completed = todos.filter((t: any) => t.status === "completed").length;
    return `${completed}/${todos.length} todos completed`;
  },
});

// --- ask_env_vars (donor schema + description verbatim) ---

const EnvVarRequestSchema = z.object({
  key: z.string().describe("The name of the environment variable (e.g. OPENAI_API_KEY)"),
  description: z.string().optional().describe("A brief description of what this key is used for"),
  instructionsUrl: z.string().optional().describe("An optional URL where the user can get this key"),
});

const askEnvVarsSchema = z.object({
  vars: z.array(EnvVarRequestSchema).min(1).describe("A list of environment variables to prompt the user for"),
});

export const askEnvVarsTool = defineTool({
  name: "ask_env_vars",
  description: `Prompt the user to provide missing environment variables or API keys.
This tool displays a UI modal asking the user to securely input the keys. The agent execution will pause until the user provides the keys or dismisses the prompt.
The collected keys are NOT automatically saved; they are returned to you as the tool result, so you must then write them to a .env.local file or use them appropriately.

<when_to_use>
Use this tool when:
- You are implementing a feature that requires an API key (e.g. OpenAI, Firebase, Resend, Stripe)
- The required environment variables do not exist in the .env or .env.local file
- You need the user to get an API key from an external service before continuing
</when_to_use>

<input_schema>
The tool accepts a "vars" array.
Each object should have:
- "key" (string, REQUIRED): The name of the env var (e.g. STRIPE_SECRET_KEY)
- "description" (string, optional): A description explaining why this key is needed
- "instructionsUrl" (string, optional): A URL guiding the user to where they can generate this key
</input_schema>
`,
  schema: askEnvVarsSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) =>
    executeAskEnvVars(askEnvVarsSchema.parse(args), ctx.sessionId, ctx.signal),
  presentCall: (args: any) => `Request keys: ${(args.vars ?? []).map((v: any) => v.key).join(", ")}`,
});

export async function executeAskEnvVars(
  input: z.infer<typeof askEnvVarsSchema>,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = askEnvVarsSchema.parse(input);
  const t = requireTransport("ask_env_vars");
  const requestId = nextRequestId("env-vars");
  t.sendEnvVarRequest(sessionId, requestId, parsed.vars);
  const result = await waitForUserInput(requestId, sessionId, "env-vars", signal);
  if (result === null) {
    return "User aborted or timed out without providing the environment variables. You must ask the user how they would like to proceed without these variables.";
  }
  let text = "User provided the following environment variables:\n\n";
  for (const [key, value] of Object.entries(result)) {
    text += `${key}=${value}\n`;
  }
  text += "\nYou must now save these variables to the appropriate environment file (e.g. .env.local) and continue with your task.";
  return text;
}

export const ALL_PLAN_TOOLS: ToolDef[] = [
  planningQuestionnaireTool,
  writePlanTool,
  exitPlanTool,
  updateTodosTool,
  askEnvVarsTool,
];
