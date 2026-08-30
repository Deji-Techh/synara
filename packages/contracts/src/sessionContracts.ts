import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";
import { TurnStatus } from "./harnessEvents";

export const SessionId = TrimmedNonEmptyString.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const TurnId = TrimmedNonEmptyString.pipe(Schema.brand("TurnId"));
export type TurnId = typeof TurnId.Type;

export const Turn = Schema.Struct({
  turnId: TurnId,
  sessionId: SessionId,
  prompt: Schema.String,
  status: TurnStatus,
  startedAt: IsoDateTime,
  completedAt: Schema.optional(IsoDateTime),
  error: Schema.optional(Schema.String),
});
export type Turn = typeof Turn.Type;

export const Session = Schema.Struct({
  sessionId: SessionId,
  projectId: Schema.String,
  threadId: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  activeTurnId: Schema.optional(TurnId),
  turns: Schema.Array(Turn),
});
export type Session = typeof Session.Type;

export const SessionEvent = Schema.Struct({
  seq: Schema.Number,
  time: IsoDateTime,
  sessionId: SessionId,
  parentUuid: Schema.optional(Schema.String),
  type: Schema.String,
  data: Schema.Unknown,
});
export type SessionEvent = typeof SessionEvent.Type;
