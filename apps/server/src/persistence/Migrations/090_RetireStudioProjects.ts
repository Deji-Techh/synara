// Purpose: Retires the removed Studio surface. Legacy kind='studio' container rows
//          become ordinary projects so their threads stay visible and reachable in
//          the sidebar; the 'studio' literal remains decodable for event replay.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // Naturally re-runnable: converted rows no longer match the predicate.
  yield* sql`
    UPDATE projection_projects
    SET kind = 'project'
    WHERE kind = 'studio'
      AND deleted_at IS NULL
  `;
});
