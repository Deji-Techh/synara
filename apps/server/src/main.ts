/**
 * CliConfig - CLI/runtime bootstrap service definitions.
 *
 * Defines startup-only service contracts used while resolving process config
 * and constructing server runtime layers.
 *
 * @module CliConfig
 */
import OS from "node:os";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Config, Data, Effect, FileSystem, Layer, Option, Path, Schema, ServiceMap } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { NetService } from "@caide/shared/Net";
import {
  optionalBooleanEnvironmentConfig,
  optionalBooleanFlag,
  resolveBooleanConfig,
  type BooleanFlagInput,
} from "@caide/shared/cli";
import {
  DEFAULT_PORT,
  deriveServerPaths,
  normalizeHttpsPublicOrigin,
  preparePrivateServerPaths,
  remoteAccessPolicyError,
  resolveCanonicalWorkspaceRoots,
  resolveStaticDir,
  ServerConfig,
  type RuntimeMode,
  type ServerConfigShape,
} from "./config";
import { fixPath, resolveBaseDir } from "./os-jank";
import { Open, OpenLive } from "./open";
import { ServerAuth } from "./auth/Services/ServerAuth";
import * as SqlitePersistence from "./persistence/Layers/Sqlite";
import { makeServerApplicationLayers } from "./serverLayers";
import { createEffectServer } from "./effectServer";
import { makeServerShutdownController } from "./serverShutdown";
import { ServerLoggerLive } from "./serverLogger";
import { ServerSettingsService } from "./serverSettings";
import { formatHostForUrl, isLoopbackHost, isWildcardHost } from "./startupAccess";

export class StartupError extends Data.TaggedError("StartupError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const DESKTOP_SHUTDOWN_TOKEN_ENV_KEY = "CAIDE_DESKTOP_SHUTDOWN_TOKEN";

function consumeDesktopShutdownTokenFromProcessEnvironment(): string | undefined {
  const matchingKeys =
    process.platform === "win32"
      ? Object.keys(process.env).filter(
          (key) => key.toUpperCase() === DESKTOP_SHUTDOWN_TOKEN_ENV_KEY,
        )
      : [DESKTOP_SHUTDOWN_TOKEN_ENV_KEY];
  let token: string | undefined;

  for (const key of matchingKeys) {
    token ??= process.env[key];
    delete process.env[key];
  }

  return token;
}

interface CliInput {
  readonly mode: Option.Option<RuntimeMode>;
  readonly port: Option.Option<number>;
  readonly host: Option.Option<string>;
  readonly caideHome: Option.Option<string>;
  readonly devUrl: Option.Option<URL>;
  readonly publicUrl: Option.Option<URL>;
  readonly allowInsecureRemote: BooleanFlagInput;
  readonly noBrowser: BooleanFlagInput;
  readonly authToken: Option.Option<string>;
  readonly autoBootstrapProjectFromCwd: BooleanFlagInput;
  readonly logProviderEvents: BooleanFlagInput;
  readonly logWebSocketEvents: BooleanFlagInput;
}

/**
 * CliConfigShape - Startup helpers required while building server layers.
 */
export interface CliConfigShape {
  /**
   * Current process working directory.
   */
  readonly cwd: string;

  /**
   * Apply OS-specific PATH normalization.
   */
  readonly fixPath: Effect.Effect<void>;

  /**
   * Resolve static web asset directory for server mode.
   */
  readonly resolveStaticDir: Effect.Effect<string | undefined>;
}

/**
 * CliConfig - Service tag for startup CLI/runtime helpers.
 */
export class CliConfig extends ServiceMap.Service<CliConfig, CliConfigShape>()(
  "caide/main/CliConfig",
) {
  static readonly layer = Layer.effect(
    CliConfig,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return {
        cwd: process.cwd(),
        fixPath: Effect.sync(fixPath),
        resolveStaticDir: resolveStaticDir().pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        ),
      } satisfies CliConfigShape;
    }),
  );
}

const CliEnvConfig = Config.all({
  mode: Config.string("CAIDE_MODE").pipe(
    Config.option,
    Config.map(
      Option.match<RuntimeMode, string>({
        onNone: () => "web",
        onSome: (value) => (value === "desktop" ? "desktop" : "web"),
      }),
    ),
  ),
  port: Config.port("CAIDE_PORT").pipe(Config.option, Config.map(Option.getOrUndefined)),
  host: Config.string("CAIDE_HOST").pipe(Config.option, Config.map(Option.getOrUndefined)),
  caideHome: Config.string("CAIDE_HOME").pipe(Config.option, Config.map(Option.getOrUndefined)),
  devUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option, Config.map(Option.getOrUndefined)),
  publicUrl: Config.url("CAIDE_PUBLIC_URL").pipe(Config.option, Config.map(Option.getOrUndefined)),
  allowInsecureRemote: optionalBooleanEnvironmentConfig("CAIDE_ALLOW_INSECURE_REMOTE"),
  noBrowser: optionalBooleanEnvironmentConfig("CAIDE_NO_BROWSER"),
  authToken: Config.string("CAIDE_AUTH_TOKEN").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  desktopShutdownToken: Config.string("CAIDE_DESKTOP_SHUTDOWN_TOKEN").pipe(
    Config.option,
    Config.map(Option.getOrUndefined),
  ),
  autoBootstrapProjectFromCwd: optionalBooleanEnvironmentConfig(
    "CAIDE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD",
  ),
  logProviderEvents: optionalBooleanEnvironmentConfig("CAIDE_LOG_PROVIDER_EVENTS"),
  logWebSocketEvents: optionalBooleanEnvironmentConfig("CAIDE_LOG_WS_EVENTS"),
});

const resolveServerConfig = (input: CliInput) =>
  Effect.gen(function* () {
    const cliConfig = yield* CliConfig;
    const { findAvailablePort } = yield* NetService;
    const env = yield* CliEnvConfig.asEffect().pipe(
      Effect.mapError(
        (cause) =>
          new StartupError({ message: "Failed to read environment configuration", cause }),
      ),
    );
    const liveProcessDesktopShutdownToken = yield* Effect.sync(
      consumeDesktopShutdownTokenFromProcessEnvironment,
    );

    const mode = Option.getOrElse(input.mode, () => env.mode);

    const port = yield* Option.match(input.port, {
      onSome: (value) => Effect.succeed(value),
      onNone: () => {
        if (env.port) {
          return Effect.succeed(env.port);
        }
        if (mode === "desktop") {
          return Effect.succeed(DEFAULT_PORT);
        }
        return findAvailablePort(DEFAULT_PORT);
      },
    });

    const devUrl = Option.getOrElse(input.devUrl, () => env.devUrl);
    const configuredPublicUrl = Option.getOrUndefined(input.publicUrl) ?? env.publicUrl;
    const publicUrl = configuredPublicUrl
      ? (normalizeHttpsPublicOrigin(configuredPublicUrl) ?? undefined)
      : undefined;
    if (configuredPublicUrl && publicUrl === undefined) {
      return yield* new StartupError({
        message:
          "CAIDE_PUBLIC_URL/--public-url must be an HTTPS root origin without credentials, path, query, or fragment (for example https://caide.example.com).",
      });
    }
    const allowInsecureRemote = resolveBooleanConfig(
      input.allowInsecureRemote,
      env.allowInsecureRemote,
      false,
    );
    const configuredHome = Option.getOrUndefined(input.caideHome) ?? env.caideHome;
    const baseDir = yield* resolveBaseDir(configuredHome);
    const userHomeDir = OS.homedir();
    const derivedPaths = yield* deriveServerPaths(baseDir, devUrl);
    yield* Effect.try({
      try: () => preparePrivateServerPaths(derivedPaths),
      catch: (cause) =>
        new StartupError({ message: "Failed to secure Caide's local state directory", cause }),
    });
    const noBrowser = resolveBooleanConfig(input.noBrowser, env.noBrowser, mode === "desktop");
    const authToken = Option.getOrUndefined(input.authToken) ?? env.authToken;
    const desktopShutdownToken = env.desktopShutdownToken ?? liveProcessDesktopShutdownToken;
    const autoBootstrapProjectFromCwd = resolveBooleanConfig(
      input.autoBootstrapProjectFromCwd,
      env.autoBootstrapProjectFromCwd,
      mode === "web",
    );
    const logProviderEvents = resolveBooleanConfig(
      input.logProviderEvents,
      env.logProviderEvents,
      false,
    );
    const logWebSocketEvents = resolveBooleanConfig(
      input.logWebSocketEvents,
      env.logWebSocketEvents,
      false,
    );
    const staticDir = devUrl ? undefined : yield* cliConfig.resolveStaticDir;
    const host = Option.getOrUndefined(input.host) ?? env.host ?? "127.0.0.1";
    const remotePolicyError = remoteAccessPolicyError({
      host,
      authToken,
      devUrl,
      publicUrl,
      allowInsecureRemote,
    });
    if (remotePolicyError) {
      return yield* new StartupError({
        message: remotePolicyError,
      });
    }

    const { homeDir, chatWorkspaceRoot } = yield* resolveCanonicalWorkspaceRoots({
      homeDir: userHomeDir,
    });

    const config: ServerConfigShape = {
      mode,
      port,
      cwd: cliConfig.cwd,
      homeDir,
      chatWorkspaceRoot,
      host,
      baseDir,
      ...derivedPaths,
      staticDir,
      devUrl,
      publicUrl,
      allowInsecureRemote,
      noBrowser,
      authToken,
      desktopShutdownToken,
      autoBootstrapProjectFromCwd,
      logProviderEvents,
      logWebSocketEvents,
    } satisfies ServerConfigShape;

    return config;
  });

export function makeServerStartupLogData(config: ServerConfigShape): Record<string, unknown> {
  const safeConfig: Record<string, unknown> = { ...config };
  delete safeConfig.authToken;
  delete safeConfig.desktopShutdownToken;
  delete safeConfig.devUrl;

  return {
    ...safeConfig,
    devUrl: config.devUrl?.toString(),
    authEnabled: Boolean(config.authToken),
  };
}

const makeServerProgram = (input: CliInput) =>
  Effect.gen(function* () {
    const cliConfig = yield* CliConfig;
    yield* cliConfig.fixPath;

    const config = yield* resolveServerConfig(input);

    if (!config.devUrl && !config.staticDir) {
      yield* Effect.logWarning(
        "web bundle missing and no VITE_DEV_SERVER_URL; web UI unavailable",
        {
          hint: "Run `bun run --cwd apps/web build` or set VITE_DEV_SERVER_URL for dev mode.",
        },
      );
    }

    const configLayer = Layer.succeed(ServerConfig, config);
    const sqliteLayer = SqlitePersistence.makeSqlitePersistenceLive(config.dbPath).pipe(
      Layer.provide(NodeServices.layer),
    );
    const { runtimeServicesLayer } = makeServerApplicationLayers(configLayer, sqliteLayer);
    const appLayer = runtimeServicesLayer.pipe(Layer.provideMerge(OpenLive));

    const shutdownController = yield* makeServerShutdownController();
    const serverEffect = Effect.gen(function* () {
      const serverAuth = yield* ServerAuth;
      const openDeps = yield* Open;

      yield* createEffectServer(shutdownController, appLayer);

      const localUrl = `http://localhost:${config.port}`;
      const bindUrl =
        config.host && !isWildcardHost(config.host)
          ? `http://${formatHostForUrl(config.host)}:${config.port}`
          : localUrl;
      const pairingBaseUrl = config.publicUrl?.origin ?? bindUrl;
      const startupPairingUrl =
        config.publicUrl || !isLoopbackHost(config.host)
          ? yield* serverAuth.issueStartupPairingUrl(pairingBaseUrl).pipe(
              Effect.mapError(
                (cause) =>
                  new StartupError({
                    message: "Failed to create the remote-access startup pairing link.",
                    cause,
                  }),
              ),
            )
          : undefined;

      yield* Effect.logInfo("Caide running", makeServerStartupLogData(config));
      if (startupPairingUrl) {
        if (config.allowInsecureRemote && !config.publicUrl) {
          yield* Effect.logWarning(
            "INSECURE REMOTE ACCESS ENABLED: credentials and session traffic are unencrypted",
            {
              pairingUrl: startupPairingUrl,
              hint: "Use only on a trusted LAN. Configure CAIDE_PUBLIC_URL behind HTTPS for protected remote access.",
            },
          );
        }
        yield* Effect.logInfo(
          config.publicUrl
            ? "Remote access requires an authenticated owner session"
            : "Insecure remote pairing link created",
          {
            pairingUrl: startupPairingUrl,
            hint:
              isWildcardHost(config.host) && !config.publicUrl
                ? "Replace localhost in this one-time URL with the server's reachable hostname or IP."
                : "Open this one-time URL to establish the first owner session.",
          },
        );
      }

      if (!config.noBrowser) {
        const target = startupPairingUrl ?? config.devUrl?.toString() ?? bindUrl;
        yield* openDeps.openBrowser(target).pipe(
          Effect.catch(() =>
            Effect.logInfo("browser auto-open unavailable", {
              hint: `Open ${target} in your browser.`,
            }),
          ),
        );
      }

      return yield* shutdownController.stopSignal;
    }).pipe(
      Effect.provide(appLayer),
      Effect.tapCause((cause) =>
        Effect.sync(() => console.error("STARTUP ERROR CAUSE:", cause)),
      ),
    );

    return yield* serverEffect;
  }).pipe(Effect.scoped);

/**
 * These flags mirrors the environment variables and the config shape.
 */

const modeFlag = Flag.choice("mode", ["web", "desktop"]).pipe(
  Flag.withDescription("Runtime mode. `desktop` keeps loopback defaults unless overridden."),
  Flag.optional,
);
const portFlag = Flag.integer("port").pipe(
  Flag.withSchema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
  Flag.withDescription("Port for the HTTP/WebSocket server."),
  Flag.optional,
);
const hostFlag = Flag.string("host").pipe(
  Flag.withDescription("Host/interface to bind (for example 127.0.0.1, 0.0.0.0, or a Tailnet IP)."),
  Flag.optional,
);
const caideHomeFlag = Flag.string("home-dir").pipe(
  Flag.withDescription("Base directory for all Caide data (equivalent to CAIDE_HOME)."),
  Flag.optional,
);
const devUrlFlag = Flag.string("dev-url").pipe(
  Flag.withSchema(Schema.URLFromString),
  Flag.withDescription("Dev web URL to proxy/redirect to (equivalent to VITE_DEV_SERVER_URL)."),
  Flag.optional,
);
const publicUrlFlag = Flag.string("public-url").pipe(
  Flag.withSchema(Schema.URLFromString),
  Flag.withDescription(
    "HTTPS public root origin provided by a TLS-terminating reverse proxy (equivalent to CAIDE_PUBLIC_URL).",
  ),
  Flag.optional,
);
const allowInsecureRemoteFlag = optionalBooleanFlag("allow-insecure-remote", {
  description:
    "Explicitly allow unencrypted authenticated remote access on a trusted LAN (equivalent to CAIDE_ALLOW_INSECURE_REMOTE).",
});
const noBrowserFlag = optionalBooleanFlag("no-browser", {
  description: "Disable automatic browser opening.",
  negativeName: "browser",
  negativeDescription: "Enable automatic browser opening.",
});
const authTokenFlag = Flag.string("auth-token").pipe(
  Flag.withDescription("Auth token required for WebSocket connections."),
  Flag.withAlias("token"),
  Flag.optional,
);
const autoBootstrapProjectFromCwdFlag = optionalBooleanFlag("auto-bootstrap-project-from-cwd", {
  description: "Create a project for the current working directory on startup when missing.",
});
const logProviderEventsFlag = optionalBooleanFlag("log-provider-events", {
  description:
    "Emit native/canonical provider NDJSON logs for debugging (equivalent to CAIDE_LOG_PROVIDER_EVENTS).",
});
const logWebSocketEventsFlag = optionalBooleanFlag("log-websocket-events", {
  description:
    "Emit server-side logs for outbound WebSocket push traffic (equivalent to CAIDE_LOG_WS_EVENTS).",
  aliases: ["log-ws-events"],
});

const mcpIntegrationFlag = Flag.string("integration").pipe(
  Flag.withDescription(
    "Paired integration id to serve (required only when more than one is stored).",
  ),
  Flag.optional,
);

// Base `caide` command defined before the MCP subcommands so they can yield
// its parsed input (notably `--home-dir` / `caideHome`) via Effect's command
// context. This avoids a duplicate `--home-dir` flag between the root command
// and its MCP subcommands, which the Effect CLI assigns to the parent and
// leaves the subcommand flag unset.
const baseServerCommand = Command.make("caide", {
  mode: modeFlag,
  port: portFlag,
  host: hostFlag,
  caideHome: caideHomeFlag,
  devUrl: devUrlFlag,
  publicUrl: publicUrlFlag,
  allowInsecureRemote: allowInsecureRemoteFlag,
  noBrowser: noBrowserFlag,
  authToken: authTokenFlag,
  autoBootstrapProjectFromCwd: autoBootstrapProjectFromCwdFlag,
  logProviderEvents: logProviderEventsFlag,
  logWebSocketEvents: logWebSocketEventsFlag,
}).pipe(Command.withDescription("Run the Caide server."));

const mcpServeCommand = Command.make(
  "serve",
  { integration: mcpIntegrationFlag },
  ({ integration }) =>
    Effect.gen(function* () {
      const parent = yield* baseServerCommand;
      const baseDir = resolveExternalMcpBaseDir(Option.getOrUndefined(parent.caideHome));
      yield* Effect.tryPromise({
        try: () =>
          serveExternalMcpStdio({
            baseDir,
            ...(Option.isSome(integration) ? { integrationId: integration.value } : {}),
          }),
        catch: (cause) =>
          new StartupError({ message: "External MCP stdio bridge stopped.", cause }),
      });
    }),
).pipe(
  Command.withDescription(
    "Serve the paired Caide external MCP integration over stdio for Codex, Claude, and other MCP clients.",
  ),
);

const mcpPairCommand = Command.make(
  "pair",
  {
    code: Flag.string("code").pipe(
      Flag.withDescription("Short-lived pairing code issued by Caide Settings."),
    ),
  },
  ({ code }) =>
    Effect.gen(function* () {
      const parent = yield* baseServerCommand;
      const baseDir = resolveExternalMcpBaseDir(Option.getOrUndefined(parent.caideHome));
      const paired = yield* Effect.tryPromise({
        try: () =>
          pairExternalMcpClient({
            baseDir,
            pairingCode: code,
          }),
        catch: (cause) => new StartupError({ message: "External MCP pairing failed.", cause }),
      });
      process.stdout.write(
        `Paired Caide external MCP integration "${paired.paired.name}".\nCredential stored privately at ${paired.storePath}.\nConfigure the MCP client command as: ${externalMcpShellCommand(externalMcpLauncher(["mcp", "serve", "--integration", paired.paired.integrationId, "--home-dir", baseDir]))}\n`,
      );
      if (process.platform === "win32") {
        process.stdout.write(
          "Windows note: Caide stores this credential under your user profile, but Windows does not expose POSIX 0600 permission checks. Protect the profile and its Caide data directory.\n",
        );
      }
    }),
).pipe(Command.withDescription("Pair this CLI with a user-approved Caide MCP integration."));

const mcpCommand = Command.make("mcp").pipe(
  Command.withDescription("Manage Caide's loopback external MCP bridge."),
  Command.withSubcommands([mcpServeCommand, mcpPairCommand]),
);

const serverCommand = baseServerCommand.pipe(
  Command.withHandler((input) => makeServerProgram(input)),
  Command.withSubcommands([mcpCommand]),
);

export const caideCli = serverCommand;
