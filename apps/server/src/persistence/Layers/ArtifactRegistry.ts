import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ArtifactId, ArtifactRecord } from "@caide/contracts";
import { Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  PersistenceSqlError,
  toPersistenceSqlError,
  toPersistenceSqlOrDecodeError,
} from "../Errors.ts";
import {
  ArtifactRegistry,
  DeleteArtifactInput,
  InsertArtifactInput,
  RenameArtifactInput,
  type ArtifactRegistryShape,
} from "../Services/ArtifactRegistry.ts";

/** DB row shape — wider than the contract record: `appDir` guards the unlink. */
const ArtifactDbRow = Schema.Struct({
  id: ArtifactId,
  projectId: Schema.NullOr(Schema.String),
  projectName: Schema.NullOr(Schema.String),
  threadId: Schema.String,
  appDir: Schema.String,
  filePath: Schema.String,
  displayName: Schema.String,
  fileName: Schema.String,
  kind: Schema.Literals(["apk", "aab", "ipa"]),
  channel: Schema.NullOr(Schema.Literals(["debug", "profile", "release"])),
  target: Schema.String,
  sizeBytes: Schema.Number,
  sha256: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
});
type ArtifactDbRow = typeof ArtifactDbRow.Type;

const toRecord = (row: ArtifactDbRow): ArtifactRecord => ({
  id: row.id,
  projectId: row.projectId as ArtifactRecord["projectId"],
  projectName: row.projectName,
  threadId: row.threadId as ArtifactRecord["threadId"],
  displayName: row.displayName,
  fileName: row.fileName,
  kind: row.kind,
  channel: row.channel,
  target: row.target,
  filePath: row.filePath,
  sizeBytes: row.sizeBytes,
  sha256: row.sha256,
  createdAt: row.createdAt,
});

/**
 * Only snapshot files inside the owning app's `.caide/artifacts/` store may be
 * unlinked by `delete` — the registry never removes arbitrary paths.
 */
const isGuardedArtifactPath = (appDir: string, filePath: string): boolean => {
  const storeRoot = path.join(path.resolve(appDir), ".caide", "artifacts");
  const resolved = path.resolve(filePath);
  const relative = path.relative(storeRoot, resolved);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const makeArtifactRegistry = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const mapRowError = (op: string) =>
    toPersistenceSqlOrDecodeError(`ArtifactRegistry.${op}:query`, `ArtifactRegistry.${op}:decode`);

  const insertRow = SqlSchema.findOne({
    Request: InsertArtifactInput,
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({
      threadId,
      appDir,
      filePath,
      fileName,
      kind,
      channel,
      target,
      sizeBytes,
      sha256,
      finishedAt,
    }) => sql`
      INSERT INTO artifacts (
        id,
        project_id,
        thread_id,
        app_dir,
        file_path,
        file_name,
        display_name,
        kind,
        channel,
        target,
        size_bytes,
        sha256,
        created_at
      )
      VALUES (
        ${randomUUID()},
        (SELECT t.project_id FROM projection_threads t WHERE t.thread_id = ${threadId}),
        ${threadId},
        ${appDir},
        ${filePath},
        ${fileName},
        ${fileName},
        ${kind},
        ${channel},
        ${target},
        ${sizeBytes},
        ${sha256},
        ${finishedAt}
      )
      RETURNING id
    `,
  });

  const findRowById = SqlSchema.findAll({
    Request: Schema.Struct({ artifactId: ArtifactId }),
    Result: ArtifactDbRow,
    execute: ({ artifactId }) => sql`
      SELECT
        a.id,
        a.project_id AS "projectId",
        (SELECT p.title FROM projection_projects p WHERE p.project_id = a.project_id)
          AS "projectName",
        a.thread_id AS "threadId",
        a.app_dir AS "appDir",
        a.file_path AS "filePath",
        a.display_name AS "displayName",
        a.file_name AS "fileName",
        a.kind,
        a.channel,
        a.target,
        a.size_bytes AS "sizeBytes",
        a.sha256,
        a.created_at AS "createdAt"
      FROM artifacts a
      WHERE a.id = ${artifactId}
    `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Struct({}),
    Result: ArtifactDbRow,
    execute: () => sql`
      SELECT
        a.id,
        a.project_id AS "projectId",
        (SELECT p.title FROM projection_projects p WHERE p.project_id = a.project_id)
          AS "projectName",
        a.thread_id AS "threadId",
        a.app_dir AS "appDir",
        a.file_path AS "filePath",
        a.display_name AS "displayName",
        a.file_name AS "fileName",
        a.kind,
        a.channel,
        a.target,
        a.size_bytes AS "sizeBytes",
        a.sha256,
        a.created_at AS "createdAt"
      FROM artifacts a
      ORDER BY a.created_at DESC
      LIMIT 500
    `,
  });

  const renameRow = SqlSchema.void({
    Request: RenameArtifactInput,
    execute: ({ artifactId, displayName }) => sql`
      UPDATE artifacts SET display_name = ${displayName} WHERE id = ${artifactId}
    `,
  });

  const deleteRow = SqlSchema.void({
    Request: DeleteArtifactInput,
    execute: ({ artifactId }) => sql`
      DELETE FROM artifacts WHERE id = ${artifactId}
    `,
  });

  const getRow = (artifactId: string): Effect.Effect<ArtifactDbRow | null, PersistenceSqlError> =>
    findRowById({ artifactId }).pipe(
      Effect.map((rows) => rows[0] ?? null),
      Effect.mapError(toPersistenceSqlError("ArtifactRegistry.get:query")),
    );

  const insert: ArtifactRegistryShape["insert"] = (input) =>
    Effect.gen(function* () {
      const inserted = yield* insertRow(input).pipe(
        Effect.mapError(toPersistenceSqlError("ArtifactRegistry.insert")),
      );
      const row = yield* getRow(inserted.id);
      if (row === null) {
        return yield* Effect.fail(
          toPersistenceSqlError("ArtifactRegistry.insert:resolve")(
            new Error("artifact row not found after insert"),
          ),
        );
      }
      return toRecord(row);
    });

  const list: ArtifactRegistryShape["list"] = () =>
    listRows({}).pipe(
      Effect.map((rows) => rows.map(toRecord)),
      Effect.mapError(mapRowError("list")),
    );

  const rename: ArtifactRegistryShape["rename"] = (input) =>
    Effect.gen(function* () {
      yield* renameRow(input).pipe(
        Effect.mapError(toPersistenceSqlError("ArtifactRegistry.rename")),
      );
      const row = yield* getRow(input.artifactId);
      if (row === null) {
        return yield* Effect.fail(
          toPersistenceSqlError("ArtifactRegistry.rename:resolve")(
            new Error("artifact row not found after rename"),
          ),
        );
      }
      return toRecord(row);
    });

  const get: ArtifactRegistryShape["get"] = (artifactId) =>
    getRow(artifactId).pipe(Effect.map((row) => (row === null ? null : toRecord(row))));

  const del: ArtifactRegistryShape["delete"] = (input) =>
    Effect.gen(function* () {
      const row = yield* getRow(input.artifactId);
      if (row !== null && isGuardedArtifactPath(row.appDir, row.filePath)) {
        // Best-effort: a missing/locked file must not block removing the row.
        yield* Effect.promise(() => fs.unlink(row.filePath)).pipe(Effect.catch(() => Effect.void));
      }
      yield* deleteRow(input).pipe(
        Effect.mapError(toPersistenceSqlError("ArtifactRegistry.delete")),
      );
      return { artifactId: input.artifactId };
    });

  return {
    insert,
    list,
    rename,
    delete: del,
    get,
  } satisfies ArtifactRegistryShape;
});

export const ArtifactRegistryLive = Layer.effect(ArtifactRegistry, makeArtifactRegistry);
