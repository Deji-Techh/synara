// FILE: shareRoute.ts
// Purpose: Public download route for share grants (item 38, first slice).
// GET /api/share?token=… — token-gated, no session auth (the token IS the
// capability). Serves files under the granting app dir only; expired or
// unknown tokens get 410/404. Sweeps expired grants opportunistically.

import * as fs from "node:fs";
import * as path from "node:path";
import Mime from "@effect/platform-node/Mime";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { resolveShareGrant } from "./shareStore.ts";

function makeShareDownloadHandler() {
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const token = url?.searchParams.get("token")?.trim() ?? "";
    if (!token) return HttpServerResponse.text("token is required", { status: 400 });
    const grant = resolveShareGrant(token);
    if (!grant) {
      return HttpServerResponse.text("Unknown or expired share link", { status: 410 });
    }
    const full = path.resolve(grant.appDir, grant.relPath);
    if (!full.startsWith(path.resolve(grant.appDir) + path.sep)) {
      return HttpServerResponse.text("Forbidden", { status: 403 });
    }
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) return HttpServerResponse.text("Not found", { status: 404 });
      const bytes = fs.readFileSync(full);
      const contentType = Mime.getType(full) ?? "application/octet-stream";
      return HttpServerResponse.uint8Array(new Uint8Array(bytes), {
        status: 200,
        contentType,
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `attachment; filename="${path.basename(full)}"`,
        },
      });
    } catch {
      return HttpServerResponse.text("Not found", { status: 404 });
    }
  }).pipe(
    Effect.catchCause(() => Effect.succeed(HttpServerResponse.text("Share unavailable", { status: 500 }))),
  );
}

export const shareDownloadRouteLayer = HttpRouter.add("GET", "/api/share", makeShareDownloadHandler());

export const shareRouteLayer = Layer.mergeAll(shareDownloadRouteLayer);
