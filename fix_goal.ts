import fs from "fs";

const file = "apps/server/src/agentGateway/Layers/AgentGateway.ts";
let content = fs.readFileSync(file, "utf-8");

const toolDef = `
  function readGoalArg(args: Record<string, unknown>, key: string): string | null {
    if (!(key in args)) {
      return null;
    }
    const value = args[key];
    if (value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new ToolInputError(\`Argument "goal" must be a string or null.\`);
    }
    const goal = value.trim();
    if (goal.length > 2000) {
      throw new ToolInputError(\`Argument "goal" must be at most 2000 characters.\`);
    }
    return goal;
  }

  const setThreadGoal: ToolEntry = {
    requiredCapability: "thread:write",
    requiresActiveTurn: true,
    definition: {
      name: "caide_set_thread_goal",
      description:
        "Set a persistent goal for a thread. Only set a goal when the user has explicitly asked for one (for example, 'keep working until X' or 'the goal of this thread is Y') or when dispatching a thread explicitly created to pursue a stated objective. Do NOT infer or invent goals from ordinary tasks or set one as a side effect of normal work. Clearing requires the same explicit user intent. When the active goal's objective has been accomplished, pass achieved: true instead of clearing: Caide records the achievement (with the time it took) and clears the goal. If the same external blocker prevents meaningful progress for three consecutive goal turns, pass blocked: true to pause the goal. Do not mark a goal blocked merely because the work is difficult, incomplete, or would benefit from clarification.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "Thread to update. Defaults to your own thread when omitted.",
          },
          goal: {
            type: ["string", "null"],
            maxLength: 2000,
            description:
              "Persistent objective. Pass null or an empty string to clear it. Ignored when achieved or blocked is true.",
          },
          achieved: {
            type: "boolean",
            description:
              "Pass true when the active goal's objective has been accomplished. Records a goal achievement and clears the goal.",
          },
          blocked: {
            type: "boolean",
            description:
              "Pass true only after the same external blocker prevents meaningful progress for three consecutive goal turns. Pauses the active goal.",
          },
        },
        required: [],
        additionalProperties: false,
      },
      annotations: { title: "Set a Caide thread goal", isUserFacing: true, readOnly: false, systemOnly: false, requirePermission: false, alwaysPromptUser: false, mcpRequiredCapabilities: [] },
    },
    handler: (args, context) =>
      Effect.gen(function* () {
        const threadId = readStringArg(args, "threadId") ?? context.callerThreadId;
        if ("achieved" in args && typeof args.achieved !== "boolean") {
          return yield* Effect.fail(new ToolInputError(\`Argument "achieved" must be a boolean.\`));
        }
        if ("blocked" in args && typeof args.blocked !== "boolean") {
          return yield* Effect.fail(new ToolInputError(\`Argument "blocked" must be a boolean.\`));
        }
        const achieved = args.achieved === true;
        const blocked = args.blocked === true;
        if (achieved && blocked) {
          return yield* Effect.fail(
            new ToolInputError(\`Arguments "achieved" and "blocked" are mutually exclusive.\`),
          );
        }
        const goal = readGoalArg(args, "goal");

        const caller = yield* requireThreadShell(context.callerThreadId);
        const target = yield* requireThreadShell(threadId);
        yield* assertCallerMayDriveThread(caller, target);

        yield* orchestrationEngine
          .dispatch({
            type: "thread.goal.set",
            commandId: CommandId.makeUnsafe(\`agent:\${randomUUID()}:goal\`),
            threadId: target.id,
            goal: achieved ? null : blocked ? target.goal : goal,
            achievedAt: achieved ? new Date().toISOString() : undefined,
            blockedAt: blocked ? new Date().toISOString() : undefined,
          })
          .pipe(Effect.mapError((error) => new ToolInputError(errorText(error))));

        return mcpToolResultJson({
          threadId: target.id,
          goal: achieved ? null : blocked ? target.goal : goal,
          achieved,
          blocked,
        });
      }).pipe(Effect.catch((error) => Effect.succeed(mcpToolResultError(errorText(error))))),
  };
`;

content = content.replace("  const automationTools =", toolDef + "\n  const automationTools =");

// inject into tools array
const targetTools = `    ...diagnosticTools,
    createThreads,
    createThread,
    sendMessage,
    interruptThread,
    setThreadTitle,
    setThreadArchived,
    setThreadGoal,`;
content = content.replace(/    \.\.\.diagnosticTools,[\s\S]*?setThreadArchived,/, targetTools);

fs.writeFileSync(file, content, "utf-8");

const file2 = "apps/server/src/provider/goalMode.ts";
let content2 = fs.readFileSync(file2, "utf-8");
content2 = content2.replace(/synara_goal/g, "caide_goal");
content2 = content2.replace(/synara_set_thread_goal/g, "caide_set_thread_goal");
content2 = content2.replace(/Synara/g, "Caide");
fs.writeFileSync(file2, content2, "utf-8");

console.log("Injected goal tool");
