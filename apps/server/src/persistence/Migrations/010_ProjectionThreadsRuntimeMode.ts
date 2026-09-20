import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN runtime_mode TEXT NOT NULL DEFAULT 'approval-required'
  `;

  yield* sql`
    UPDATE projection_threads
    SET runtime_mode = 'approval-required'
    WHERE runtime_mode IS NULL
  `;
});
