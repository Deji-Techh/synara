import { describe, it, expect } from "vitest";
import { getSystemShell, getStandardShellEnv } from "../shell_utils";
import { killProcessTree } from "../process_tree";
import { ProcessSemaphore } from "../process_semaphore";

describe("shell_harness_utils", () => {
  it("resolves system shell appropriate for host OS", () => {
    const spec = getSystemShell("npm test");
    expect(spec.command).toBeTruthy();
    expect(Array.isArray(spec.args)).toBe(true);
    expect(spec.args.join(" ")).toContain("npm test");
  });

  it("provides non-interactive environment flags", () => {
    const env = getStandardShellEnv({ CUSTOM_VAR: "true" });
    expect(env.CI).toBe("1");
    expect(env.FORCE_COLOR).toBe("0");
    expect(env.NONINTERACTIVE).toBe("1");
    expect(env.CUSTOM_VAR).toBe("true");
  });

  it("handles killProcessTree gracefully for undefined or invalid pids", () => {
    expect(() => killProcessTree(undefined)).not.toThrow();
    expect(() => killProcessTree(0)).not.toThrow();
    expect(() => killProcessTree(-1)).not.toThrow();
  });

  it("throttles concurrency with ProcessSemaphore", async () => {
    const sem = new ProcessSemaphore(2);
    expect(sem.active).toBe(0);

    const rel1 = await sem.acquire();
    expect(sem.active).toBe(1);

    const rel2 = await sem.acquire();
    expect(sem.active).toBe(2);

    let acquired3 = false;
    const p3 = sem.acquire().then((rel) => {
      acquired3 = true;
      return rel;
    });

    expect(sem.waiting).toBe(1);
    expect(acquired3).toBe(false);

    rel1();
    const rel3 = await p3;
    expect(acquired3).toBe(true);

    rel2();
    rel3();
    expect(sem.active).toBe(0);
  });
});
