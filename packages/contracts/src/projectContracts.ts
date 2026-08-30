import { Schema } from "effect";
import { IsoDateTime, ProjectId, ThreadId } from "./baseSchemas";
import { ProjectFramework } from "./projectFramework";

export const Thread = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Thread = typeof Thread.Type;

export const Project = Schema.Struct({
  projectId: ProjectId,
  name: Schema.String,
  framework: ProjectFramework,
  path: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  threads: Schema.Array(Thread),
});
export type Project = typeof Project.Type;
