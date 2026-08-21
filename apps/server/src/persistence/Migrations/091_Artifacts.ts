// Purpose: Global build-artifact registry. One row per successful Flutter
//          build (APK/AAB/IPA) snapshotted by the engine into the app's stable
//          `.caide/artifacts/` store; powers the Caide-menu Artifacts gallery.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      thread_id TEXT NOT NULL,
      app_dir TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      channel TEXT,
      target TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_artifacts_created_at
      ON artifacts (created_at DESC)
  `;
});
