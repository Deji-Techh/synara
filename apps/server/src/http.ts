import nodePath from "node:path";
import Mime from "@effect/platform-node/Mime";
import {
  AuthBootstrapInput,
  AuthCreatePairingCredentialInput,
  AuthRevokeClientSessionInput,
  AuthRevokePairingLinkInput,
} from "@caide/contracts";
import { DateTime, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { authErrorResponse, makeEffectAuthRequest } from "./auth/effectHttp";
import { AuthError, ServerAuth } from "./auth/Services/ServerAuth";
import { SessionCredentialService } from "./auth/Services/SessionCredentialService";
import { deriveAuthClientMetadata } from "./auth/utils";
import { ServerConfig, type ServerConfigShape } from "./config";
import { ProjectFaviconResolver } from "./project/Services/ProjectFaviconResolver";
import type { ServerReadiness } from "./server/readiness";
import { isLoopbackHost } from "./startupAccess";
import {
  authorizeDesktopShutdown,
  DESKTOP_SHUTDOWN_ROUTE_PATH,
  type ServerShutdownController,
} from "./serverShutdown";
import {
  ifNoneMatchSatisfies,
  isSidecarRequestPath,
  negotiateStaticEncodingPreference,
  staticCacheControl,
  staticEtag,
} from "./staticAssets";
import {
  isTrustedAppOrigin,
  normalizeCorsOrigin,
  shouldRejectAuthMutationOrigin,
} from "./trustedOrigins";

const trustedMutationCorsHeaders = (input: {
  readonly request: HttpServerRequest.HttpServerRequest;
  readonly url: URL;
  readonly config: Pick<
    ServerConfigShape,
    "mode" | "publicUrl" | "allowInsecureRemote" | "devUrl"
  >;
}): Record<string, string> | null => {
  const originHeader = input.request.headers.origin;
  const origin = originHeader ? normalizeCorsOrigin(originHeader) : null;
  const hostHeader = input.request.headers.host ?? "";
  const directLoopbackOrigin =
    !origin &&
    input.config.mode === "desktop" &&
    isLoopbackHost(input.url.hostname) &&
    (hostHeader.length === 0 || isLoopbackHost(hostHeader.split(":")[0] ?? ""));

  if (!origin && !directLoopbackOrigin) {
    return null;
  }

  if (
    origin &&
    shouldRejectAuthMutationOrigin({
      mode: input.config.mode,
      origin,
      publicUrl: input.config.publicUrl,
      allowInsecureRemote: input.config.allowInsecureRemote,
      devUrl: input.config.devUrl,
    })
  ) {
    return null;
  }

  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin ?? "*",
    Vary: "Origin",
  };
};

const readEffectJson = (
  request: HttpServerRequest.HttpServerRequest,
  invalidJsonMessage = "Invalid JSON payload.",
) =>
  request.text.pipe(
    Effect.flatMap((text) =>
      Effect.try({
        try: () => (text.trim().length === 0 ? {} : JSON.parse(text)),
        catch: () => new Error(invalidJsonMessage),
      }),
    ),
  );

const decodeEffectJson = <A, I>(
  schema: Schema.Schema<A, I>,
  request: HttpServerRequest.HttpServerRequest,
  invalidJsonMessage?: string,
) =>
  readEffectJson(request, invalidJsonMessage).pipe(
    Effect.flatMap((json) =>
      Schema.decodeUnknownEffect(schema)(json).pipe(
        Effect.mapError(
          (issue) => new Error(`Payload validation failed: ${Schema.TreeFormatter.formatIssue(issue)}`),
        ),
      ),
    ),
  );

const requireAuthenticatedRequest = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  return yield* serverAuth.authenticate(makeEffectAuthRequest(request));
});

export const readinessEffectRouteLayer = (readiness: ServerReadiness) =>
  Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/ready",
      Effect.gen(function* () {
        const snapshot = yield* readiness.getSnapshot;
        return HttpServerResponse.jsonUnsafe(snapshot, {
          status: snapshot.startupReady ? 200 : 503,
        });
      }),
    ),
    HttpRouter.add(
      "GET",
      "/health",
      Effect.sync(() =>
        HttpServerResponse.jsonUnsafe({ ok: true, startupReady: true }, { status: 200 }),
      ),
    ),
  );

export const desktopShutdownEffectRouteLayer = (shutdownController: ServerShutdownController) =>
  HttpRouter.add(
    "POST",
    DESKTOP_SHUTDOWN_ROUTE_PATH,
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = HttpServerRequest.toURL(request);
      if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

      const corsHeaders = trustedMutationCorsHeaders({ request, url, config });
      if (corsHeaders === null) {
        return HttpServerResponse.jsonUnsafe(
          { error: "Trusted request origin required." },
          { status: 403 },
        );
      }

      const body = yield* readEffectJson(request, "Invalid shutdown payload.");
      const token =
        typeof (body as { readonly token?: unknown }).token === "string"
          ? (body as { readonly token: string }).token
          : null;

      if (!authorizeDesktopShutdown({ config, token })) {
        return HttpServerResponse.jsonUnsafe(
          { error: "Unauthorized shutdown request." },
          { status: 401, headers: corsHeaders },
        );
      }

      yield* shutdownController.requestShutdown;
      return HttpServerResponse.jsonUnsafe(
        { ok: true },
        { status: 200, headers: corsHeaders },
      );
    }),
  );

export const staticAndDevEffectRouteLayer = HttpRouter.add(
  "GET",
  "*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

    const config = yield* ServerConfig;
    if (config.devUrl) {
      return HttpServerResponse.redirect(config.devUrl.toString(), { status: 302 });
    }

    if (!config.staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staticRoot = path.resolve(config.staticDir);
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const rawRelativePath = requestPath.replace(/^[/\\]+/, "");
    const relativePath = path.normalize(rawRelativePath).replace(/^[/\\]+/, "");
    if (
      relativePath.length === 0 ||
      rawRelativePath.startsWith("..") ||
      relativePath.startsWith("..") ||
      relativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }
    if (isSidecarRequestPath(relativePath)) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    let filePath = path.resolve(staticRoot, relativePath);
    if (!filePath.startsWith(staticRoot)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }
    if (!path.extname(filePath)) {
      filePath = path.resolve(filePath, "index.html");
    }

    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));

    const targetPath =
      fileInfo && fileInfo.type === "File" ? filePath : path.resolve(staticRoot, "index.html");

    const exists = yield* fileSystem.exists(targetPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const baseContentType = Mime.getType(targetPath) ?? "application/octet-stream";
    const contentType =
      baseContentType === "text/html" ? "text/html; charset=utf-8" : baseContentType;
    const data = yield* fileSystem.readFile(targetPath).pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) return HttpServerResponse.text("Not Found", { status: 404 });

    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType,
      headers: {
        "Cache-Control": staticCacheControl(path.relative(staticRoot, targetPath)),
      },
    });
  }),
);

export const projectFaviconRouteLayer = HttpRouter.add(
  "GET",
  "/project/favicon",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (!url) return HttpServerResponse.text("Bad Request", { status: 400 });

    const cwd = url.searchParams.get("cwd")?.trim() ?? "";
    if (!cwd) return HttpServerResponse.text("cwd is required", { status: 400 });

    const resolver = yield* ProjectFaviconResolver;
    const favicon = yield* resolver.resolveFavicon(cwd);
    if (Option.isNone(favicon)) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    return HttpServerResponse.uint8Array(favicon.value.bytes, {
      status: 200,
      contentType: favicon.value.contentType,
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    });
  }),
);

export const makeEffectHttpRouteLayer = (
  readiness: ServerReadiness,
  shutdownController: ServerShutdownController,
) =>
  Layer.mergeAll(
    readinessEffectRouteLayer(readiness),
    desktopShutdownEffectRouteLayer(shutdownController),
    projectFaviconRouteLayer,
    staticAndDevEffectRouteLayer,
  );
