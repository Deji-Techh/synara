import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { columnExists } from "./schemaHelpers.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  if (yield* columnExists(sql, "projection_projects", "framework")) return;
  yield* sql`ALTER TABLE projection_projects ADD COLUMN framework TEXT NOT NULL DEFAULT 'blank'`;
});
