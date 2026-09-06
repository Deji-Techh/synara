// FILE: planStore.test.ts
// Purpose: Plan draft frontmatter (write/parse/list/accept) + session
// acceptance records (presented → accepted handoff state).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearPlanRecords,
  getAcceptedPlan,
  listPlanFiles,
  markPlanFileAccepted,
  parsePlanFile,
  planFileName,
  recordPlanAccepted,
  recordPlanPresented,
  slugifyPlanTitle,
  writePlanFile,
} from "./planStore.ts";

describe("dyad plan store", () => {
  it("slugifies titles and names files <slug>-<ts>.md", () => {
    expect(slugifyPlanTitle("Auth System!")).toBe("auth-system");
    expect(planFileName("Auth System", 123)).toBe("auth-system-123.md");
  });

  it("round-trips frontmatter and rejects invalid files", () => {
    expect(parsePlanFile("no frontmatter")).toBeNull();
    expect(parsePlanFile("---\ntitle: x\n---\nbody")).toBeNull();
    const parsed = parsePlanFile(
      '---\nid: "a-1"\ntitle: "T"\nstatus: draft\ncreatedAt: 5\n---\n\n# T\n',
    );
    expect(parsed).toMatchObject({ id: "a-1", title: "T", status: "draft", createdAt: 5 });
  });

  it("writes draft files, lists them, and marks acceptance", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-planstore-"));
    const record = await writePlanFile(dir, { title: "Auth System", summary: "Login.", plan: "## Steps" }, 777);
    expect(record.status).toBe("draft");
    expect(record.file).toMatch(/auth-system-777\.md$/);
    expect(await listPlanFiles(dir)).toEqual(["auth-system-777.md"]);
    const onDisk = parsePlanFile(fs.readFileSync(record.file!, "utf-8"));
    expect(onDisk).toMatchObject({ id: "auth-system-777", title: "Auth System", status: "draft" });

    await markPlanFileAccepted(record.file!, 888);
    expect(parsePlanFile(fs.readFileSync(record.file!, "utf-8"))).toMatchObject({
      status: "accepted",
      acceptedAt: 888,
    });
    expect(await listPlanFiles(fs.mkdtempSync(path.join(os.tmpdir(), "caide-empty-")))).toEqual([]);
  });

  it("tracks presented → accepted per session", () => {
    const sid = "s-planstore";
    clearPlanRecords(sid);
    expect(recordPlanAccepted(sid)).toBeUndefined();
    recordPlanPresented(sid, {
      id: "p-1",
      title: "T",
      summary: "S",
      plan: "P",
      status: "draft",
      createdAt: 1,
    });
    const accepted = recordPlanAccepted(sid, 2)!;
    expect(accepted).toMatchObject({ status: "accepted", acceptedAt: 2 });
    expect(getAcceptedPlan(sid)?.id).toBe("p-1");
    clearPlanRecords(sid);
    expect(getAcceptedPlan(sid)).toBeUndefined();
  });
});
