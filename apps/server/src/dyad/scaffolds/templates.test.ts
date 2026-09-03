// FILE: templates.test.ts
// Purpose: D gate — template trees copy with app-name applied, skipping
// build artifacts.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldApi, scaffoldWeb3 } from "./templates.ts";

describe("template scaffolds (d)", () => {
  it("copies the web3 tree with the app name applied", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-web3-"));
    const files = await scaffoldWeb3(dir, "MyDapp");
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain("package.json");
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("mydapp");
  });

  it("copies the api tree with the app name applied", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-api-"));
    const files = await scaffoldApi(dir, "MyApi");
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("Dockerfile"))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("myapi");
  });
});
