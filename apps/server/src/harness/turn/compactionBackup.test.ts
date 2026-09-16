// FILE: compactionBackup.test.ts
// Purpose: Backup transcript shape (donor formatAsTranscript parity): tool
// tag transform with chars/truncated accounting, messageCount header,
// keep-last-5 retention, gitignore.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { transformToolTags, writeCompactionBackup } from "./compactionBackup.ts";

describe("transformToolTags (donor verbatim)", () => {
  it("rewrites mcp call/result tags with truncation accounting", () => {
    const big = "x".repeat(1500);
    const out = transformToolTags(
      `<dyad-mcp-tool-call server="s" tool="t" call-id="1">\ncall-body\n</dyad-mcp-tool-call>\n<dyad-mcp-tool-result server="s" tool="t">\n${big}\n</dyad-mcp-tool-result>`,
    );
    expect(out).toContain('<tool-use name="t" server="s">');
    expect(out).toContain('chars="1500"');
    expect(out).toContain('truncated="true"');
    expect(out).not.toContain("dyad-mcp-tool-call");
  });

  it("leaves plain text alone", () => {
    expect(transformToolTags("hello")).toBe("hello");
  });
});

describe("writeCompactionBackup", () => {
  it("writes the donor transcript shape and prunes to keep-last-5", async () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), "caide-cb-"));
    const history = [
      { role: "user", content: "do the thing" },
      { role: "assistant", content: "did it" },
    ];
    const first = await writeCompactionBackup("s1", app, history);
    expect(first).toMatch(/^\.dyad\/chats\/s1\/compaction-.*\.md$/);
    const body = fs.readFileSync(path.join(app, first as string), "utf8");
    expect(body).toContain('messageCount="2"');
    expect(body).toContain('<msg role="user">');
    expect(body).not.toContain('index="');
    // .dyad gitignored.
    expect(fs.readFileSync(path.join(app, ".gitignore"), "utf8")).toContain(".dyad/");
    for (let i = 0; i < 6; i++) {
      await writeCompactionBackup("s1", app, history);
    }
    const files = fs
      .readdirSync(path.join(app, ".dyad", "chats", "s1"))
      .filter((f) => f.startsWith("compaction-"));
    expect(files).toHaveLength(5);
    expect(first).not.toBeNull();
  });

  it("never throws without an app path", async () => {
    await expect(writeCompactionBackup("s1", undefined, [])).resolves.toBeNull();
  });
});
