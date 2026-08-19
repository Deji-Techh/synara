import { describe, it, expect } from "vitest";
import { appendCappedOutput } from "./run_command";

describe("appendCappedOutput", () => {
  it("returns the full buffer when under the cap", () => {
    const res = appendCappedOutput("abc", "def");
    expect(res.buf).toBe("abcdef");
    expect(res.truncated).toBe(false);
  });

  it("keeps the tail once the cap is exceeded", () => {
    const chunk = "x".repeat(2000);
    const res = appendCappedOutput("", chunk);
    expect(res.buf.length).toBe(1500);
    expect(res.buf).toBe("x".repeat(1500));
    expect(res.truncated).toBe(true);
  });

  it("preserves the tail across successive chunks", () => {
    let buf = "";
    let truncated = false;
    for (let i = 0; i < 10; i++) {
      const res = appendCappedOutput(buf, `chunk-${i}-${"y".repeat(500)}`);
      buf = res.buf;
      truncated = truncated || res.truncated;
    }
    expect(truncated).toBe(true);
    expect(buf.length).toBeLessThanOrEqual(1500);
    expect(buf.endsWith("y".repeat(500))).toBe(true);
  });

  it("returns truncated false for a buffer exactly at the cap", () => {
    const res = appendCappedOutput("", "z".repeat(1500));
    expect(res.buf.length).toBe(1500);
    expect(res.truncated).toBe(false);
  });
});
