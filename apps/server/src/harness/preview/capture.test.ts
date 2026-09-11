// FILE: capture.test.ts
// Purpose: Item 1 gate — headless CDP capture returns real PNG bytes against
// a loopback page. Skips when no Chrome binary exists (CI without Chrome).

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { capturePreviewScreenshot, CaptureUnavailableError } from "./capture.ts";

function servePage(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><h1>Caide capture test</h1></body></html>");
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

describe("headless preview capture (item 1)", () => {
  it("captures real PNG bytes from a loopback page", async () => {
    const { server, url } = await servePage();
    try {
      let shot;
      try {
        shot = await capturePreviewScreenshot({ url, width: 390, height: 844, timeoutMs: 60000 });
      } catch (err) {
        if (err instanceof CaptureUnavailableError) return;
        throw err;
      }
      expect(shot.base64.length).toBeGreaterThan(1000);
      expect(shot.width).toBeGreaterThanOrEqual(390);
      expect(shot.height).toBeGreaterThanOrEqual(844);
      const bytes = Buffer.from(shot.base64, "base64");
      expect(bytes.readUInt32BE(0)).toBe(0x89504e47);
    } finally {
      await new Promise((r) => server.close(r));
    }
  }, 90000);
});
