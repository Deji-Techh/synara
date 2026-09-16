/**
 * Chat-compat columns for the V1 transplant (010 M2): thread-level
 * initial-commit + chat-mode, and message-level approval/provenance/model
 * linkage that fork, revert-prune, renderer projection, and token accounting
 * read. All nullable (backfill-free); writers fill them going forward.
 * Statements are explicit (no dynamic identifiers in DDL).
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { columnExists } from "./schemaHelpers.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  if (!(yield* columnExists(sql, "projection_threads", "initial_commit_hash"))) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN initial_commit_hash TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_threads", "chat_mode"))) {
    yield* sql`ALTER TABLE projection_threads ADD COLUMN chat_mode TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "approval_state"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN approval_state TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "source_commit_hash"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN source_commit_hash TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "commit_hash"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN commit_hash TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "request_id"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN request_id TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "max_tokens_used"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN max_tokens_used INTEGER`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "model"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN model TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "ai_messages_json"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN ai_messages_json TEXT`;
  }
  if (!(yield* columnExists(sql, "projection_thread_messages", "is_compaction_summary"))) {
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN is_compaction_summary INTEGER NOT NULL DEFAULT 0`;
  }
});
