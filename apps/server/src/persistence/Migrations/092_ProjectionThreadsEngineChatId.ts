import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Effect } from "effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const [column] = yield* sql<{ readonly exists: number }>`
    SELECT EXISTS(
      SELECT 1
      FROM pragma_table_info('projection_threads')
      WHERE name = 'engine_chat_id'
    ) AS "exists"
  `;
  if (column?.exists !== 1) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN engine_chat_id INTEGER NULL
    `;
  }
});
