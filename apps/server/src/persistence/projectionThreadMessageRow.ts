import {
  ChatAttachment,
  MessageDispatchOrigin,
  NonNegativeInt,
  ProviderMentionReference,
  ProviderSkillReference,
  TurnDispatchMode,
  type OrchestrationMessage,
} from "@caide/contracts";
import { Schema, Struct } from "effect";

import {
  ProjectionThreadMessage,
  type ProjectionThreadMessage as ProjectionThreadMessageRecord,
} from "./Services/ProjectionThreadMessages.ts";

export const ProjectionThreadMessageDbRowSchema = ProjectionThreadMessage.mapFields(
  Struct.assign({
    isStreaming: Schema.Number,
    attachments: Schema.NullOr(Schema.fromJsonString(Schema.Array(ChatAttachment))),
    skills: Schema.NullOr(Schema.fromJsonString(Schema.Array(ProviderSkillReference))),
    mentions: Schema.NullOr(Schema.fromJsonString(Schema.Array(ProviderMentionReference))),
    dispatchMode: Schema.NullOr(TurnDispatchMode),
    dispatchOrigin: Schema.NullOr(MessageDispatchOrigin),
    sequence: Schema.NullOr(NonNegativeInt),
    // Compat columns default null/0 so pre-migration rows and hand-built
    // literals keep decoding.
    approvalState: Schema.optional(Schema.NullOr(Schema.Literals(["approved", "rejected"]))).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    sourceCommitHash: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    commitHash: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    requestId: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    maxTokensUsed: Schema.optional(Schema.NullOr(Schema.Number)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    model: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    aiMessagesJson: Schema.optional(Schema.NullOr(Schema.String)).pipe(
      Schema.withDecodingDefault(() => null),
    ),
    isCompactionSummary: Schema.optional(Schema.Number).pipe(Schema.withDecodingDefault(() => 0)),
  }),
);

export type ProjectionThreadMessageDbRow = Schema.Schema.Type<
  typeof ProjectionThreadMessageDbRowSchema
>;

export function projectionThreadMessageFromRow(
  row: ProjectionThreadMessageDbRow,
): ProjectionThreadMessageRecord {
  return {
    messageId: row.messageId,
    threadId: row.threadId,
    turnId: row.turnId,
    role: row.role,
    text: row.text,
    isStreaming: row.isStreaming === 1,
    source: row.source,
    ...(row.sequence !== null ? { sequence: row.sequence } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.attachments !== null ? { attachments: row.attachments } : {}),
    ...(row.skills !== null ? { skills: row.skills } : {}),
    ...(row.mentions !== null ? { mentions: row.mentions } : {}),
    ...(row.dispatchMode ? { dispatchMode: row.dispatchMode } : {}),
    ...(row.dispatchOrigin ? { dispatchOrigin: row.dispatchOrigin } : {}),
    ...(row.approvalState ? { approvalState: row.approvalState } : {}),
    ...(row.sourceCommitHash != null ? { sourceCommitHash: row.sourceCommitHash } : {}),
    ...(row.commitHash != null ? { commitHash: row.commitHash } : {}),
    ...(row.requestId != null ? { requestId: row.requestId } : {}),
    ...(row.maxTokensUsed != null ? { maxTokensUsed: row.maxTokensUsed } : {}),
    ...(row.model != null ? { model: row.model } : {}),
    ...(row.aiMessagesJson != null ? { aiMessagesJson: row.aiMessagesJson } : {}),
    ...(row.isCompactionSummary === 1 ? { isCompactionSummary: true } : {}),
  };
}

export function orchestrationMessageFromProjectionRow(
  row: ProjectionThreadMessageDbRow,
): OrchestrationMessage {
  return {
    id: row.messageId,
    role: row.role,
    text: row.text,
    ...(row.attachments !== null ? { attachments: row.attachments } : {}),
    ...(row.skills !== null ? { skills: row.skills } : {}),
    ...(row.mentions !== null ? { mentions: row.mentions } : {}),
    ...(row.dispatchMode ? { dispatchMode: row.dispatchMode } : {}),
    ...(row.dispatchOrigin ? { dispatchOrigin: row.dispatchOrigin } : {}),
    turnId: row.turnId,
    streaming: row.isStreaming === 1,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
