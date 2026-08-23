import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationReadModel,
} from "@caide/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const NOW = "2026-07-25T18:00:00.000Z";
const THREAD_ID = ThreadId.makeUnsafe("thread-auto-claude");
const PROJECT_ID = ProjectId.makeUnsafe("project-auto-claude");

function makeReadModel(threadOverrides?: {
  creationSource?: "provider_native";
}): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    updatedAt: NOW,
    spaces: [],
    projects: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Groq Auto",
        modelSelection: {
          provider: "groq",
          model: "llama-3.3-70b-versatile",
        },
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "auto",
        branch: null,
        worktreePath: null,
        createdAt: NOW,
        updatedAt: NOW,
        latestTurn: null,
        handoff: null,
        messages: [],
        session: null,
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        deletedAt: null,
        ...(threadOverrides?.creationSource !== undefined
          ? { creationSource: threadOverrides.creationSource }
          : {}),
      },
    ],
  };
}

async function makeProjectOnlyReadModel(): Promise<OrchestrationReadModel> {
  return Effect.runPromise(
    projectEvent(createEmptyReadModel(NOW), {
      sequence: 1,
      eventId: EventId.makeUnsafe("evt-project-create"),
      aggregateKind: "project",
      aggregateId: PROJECT_ID,
      type: "project.created",
      occurredAt: NOW,
      commandId: CommandId.makeUnsafe("cmd-project-create"),
      causationEventId: null,
      correlationId: CommandId.makeUnsafe("cmd-project-create"),
      metadata: {},
      payload: {
        projectId: PROJECT_ID,
        kind: "project",
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
    }),
  );
}

describe("decider Auto model compatibility", () => {
  it("allows a model selection with a supported provider in Auto mode", async () => {
    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-supported-groq-model"),
          threadId: THREAD_ID,
          modelSelection: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
          },
        },
        readModel: makeReadModel(),
      }),
    );

    expect("type" in event ? event.type : event[0]?.type).toBe("thread.meta-updated");
  });

  it("allows a user-created Auto thread with a supported provider", async () => {
    const readModel = await makeProjectOnlyReadModel();

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.create",
          commandId: CommandId.makeUnsafe("cmd-user-auto-groq"),
          threadId: ThreadId.makeUnsafe("thread-user-auto"),
          projectId: PROJECT_ID,
          title: "User Auto thread",
          modelSelection: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
          },
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "auto",
          envMode: "local",
          branch: null,
          worktreePath: null,
          createBranchFlowCompleted: false,
          createdAt: NOW,
        },
        readModel,
      }),
    );

    const event = Array.isArray(result) ? result[0] : result;
    expect(event?.type).toBe("thread.created");
  });

  it("allows model updates on provider-native threads", async () => {
    const event = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "thread.meta.update",
          commandId: CommandId.makeUnsafe("cmd-subagent-model-update"),
          threadId: THREAD_ID,
          modelSelection: {
            provider: "groq",
            model: "llama-3.3-70b-versatile",
          },
        },
        readModel: makeReadModel({ creationSource: "provider_native" }),
      }),
    );

    expect("type" in event ? event.type : event[0]?.type).toBe("thread.meta-updated");
  });
});
