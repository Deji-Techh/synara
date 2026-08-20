// FILE: providerChildEnvironment.ts
// Purpose: Builds provider child environments without Caide control-plane authority.
// Layer: Server provider process security

export type ProviderChildKind =
  | "acp"
  | "google"
  | "anthropic"
  | "openai"
  | "openai"
  | "openai"
  | "engine"
  | "openai"
  | "openai"
  | "openai"
  | "openai";

const PROVIDER_CREDENTIAL_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "XAI_API_KEY",
  "GROK_CODE_XAI_API_KEY",
  "FACTORY_API_KEY",
  "CURSOR_API_KEY",
]);

const PROVIDER_CREDENTIAL_GRANTS: Record<ProviderChildKind, "all" | ReadonlySet<string>> = {
  antigravity: new Set(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]),
  claude: new Set([
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ]),
  cursor: new Set(["CURSOR_API_KEY"]),
  droid: new Set(["FACTORY_API_KEY"]),
  grok: new Set(["XAI_API_KEY", "GROK_CODE_XAI_API_KEY"]),
  // These profiles deliberately support arbitrary upstream model providers.
  acp: "all",
  codex: "all",
  engine: "all",
  kilo: "all",
  opencode: "all",
  pi: "all",
};

const INHERITED_NATIVE_CAPABILITY_KEYS = new Set([
  "BUN_OPTIONS",
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS",
]);

const isTestHarnessKey = (key: string, env: NodeJS.ProcessEnv): boolean =>
  Boolean(env.VITEST) && (key.startsWith("CAIDE_FAKE_") || key.startsWith("CAIDE_ACP_"));

export function buildProviderChildEnvironment(input: {
  readonly provider: ProviderChildKind;
  readonly baseEnv?: NodeJS.ProcessEnv;
  readonly inheritedCaideKeys?: ReadonlyArray<string>;
  readonly inheritedNativeCapabilityKeys?: ReadonlyArray<string>;
  readonly overrides?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const baseEnv = {
    ...(input.baseEnv ?? process.env),
    ...input.overrides,
  };
  const allowedCaideKeys = new Set(input.inheritedCaideKeys ?? []);
  const allowedNativeCapabilities = new Set(input.inheritedNativeCapabilityKeys ?? []);
  const credentialGrants = PROVIDER_CREDENTIAL_GRANTS[input.provider];
  const childEnv: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith("CAIDE_") && !allowedCaideKeys.has(key) && !isTestHarnessKey(key, baseEnv)) {
      continue;
    }
    if (INHERITED_NATIVE_CAPABILITY_KEYS.has(key) && !allowedNativeCapabilities.has(key)) {
      continue;
    }
    if (
      PROVIDER_CREDENTIAL_KEYS.has(key) &&
      credentialGrants !== "all" &&
      !credentialGrants.has(key)
    ) {
      continue;
    }
    childEnv[key] = value;
  }

  return childEnv;
}

/**
 * Build a safe, minimal environment for provider child processes.
 * Uses a whitelist approach to prevent E2BIG spawn errors.
 *
 * Unlike `buildProviderChildEnvironment` which inherits the full process.env
 * and strips a few keys, this function starts from an empty env and only adds
 * essential variables. This keeps the env well under Linux's ~128KB execve limit.
 */
export function buildSafeProviderChildEnvironment(input: {
  readonly provider: ProviderChildKind;
  readonly overrides?: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
  const SAFE_KEYS = [
    "PATH", "HOME", "USER", "TMPDIR", "TMP", "TEMP",
    "LANG", "LC_ALL", "LC_CTYPE",
    "SHELL", "TERM",
    "SSH_AUTH_SOCK",
    "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR",
    // Node/Bun runtime
    "NODE_ENV", "BUN_INSTALL",
    // Flutter SDK
    "FLUTTER_SDK_DIR", "FLUTTER_SDK_BIN", "FLUTTER_ROOT",
    "ANDROID_HOME", "ANDROID_SDK_ROOT", "JAVA_HOME",
    "DART_SDK", "PUB_CACHE",
  ];

  const credentialGrants = PROVIDER_CREDENTIAL_GRANTS[input.provider];
  const env: NodeJS.ProcessEnv = {};

  // Whitelist system vars
  for (const key of SAFE_KEYS) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }

  // Add granted credentials only
  for (const key of Object.keys(process.env)) {
    if (
      PROVIDER_CREDENTIAL_KEYS.has(key) &&
      (credentialGrants === "all" || credentialGrants.has(key))
    ) {
      env[key] = process.env[key];
    }
  }

  // Apply overrides
  if (input.overrides) {
    Object.assign(env, input.overrides);
  }

  return env;
}
