import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("094_McpServers", (it) => {
  it.effect("creates mcp_servers and mcp_tool_consents tables", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 94 });

      yield* sql`
        INSERT INTO mcp_servers (id, name, transport, command, created_at, updated_at)
        VALUES ('s1', 'github', 'stdio', 'npx', '2026-09-03T00:00:00.000Z', '2026-09-03T00:00:00.000Z')
      `;
      yield* sql`
        INSERT INTO mcp_tool_consents (server_id, tool_name, consent, updated_at)
        VALUES ('s1', 'issue_write', 'always', '2026-09-03T00:00:00.000Z')
      `;
      const servers = yield* sql`SELECT id, name, transport FROM mcp_servers`;
      const consents = yield* sql`SELECT consent FROM mcp_tool_consents WHERE server_id = 's1'`;
      assert.deepStrictEqual(servers, [{ id: "s1", name: "github", transport: "stdio" }]);
      assert.deepStrictEqual(consents, [{ consent: "always" }]);

      // Re-running is idempotent.
      yield* runMigrations({ toMigrationInclusive: 94 });
    }),
  );
});
