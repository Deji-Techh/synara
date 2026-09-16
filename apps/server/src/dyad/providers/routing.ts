// FILE: routing.ts
// Purpose: Direct-connection routing — settings key wins, env var fallback,
// local runtimes keyless. Endpoint shape reuses the harness SSE adapter
// (single import; M3 unifies the two) so there is exactly one SSE dialect
// table. No gateway, no quota checks, no subscription gates — every provider
// with a key (or none, for local) is usable.
// Donor: dyad get_model_client.ts getRegularModelClient (per-provider base
// URLs, azure resource + test-URL handling, ollama/lmstudio defaults).

import { endpointForModel } from "../../harness/provider/apiAdapter.ts";
import { getDefaultModel, type ProviderKind } from "@caide/shared/model";
import { resolveApiKeyOrThrow } from "./apiKey.ts";
import { readChatGPTSession } from "./chatgptAuth.ts";
import { PROVIDERS } from "./providers.ts";

export interface ProviderSettingsInput {
  apiKey?: { value?: string | null } | string | null;
  apiBaseUrl?: string | null;
  baseUrl?: string | null;
  resourceName?: string | null;
  /** Vertex service-account JSON (009 M2; transport lands later). */
  serviceAccountKey?: string | null;
  /** Vertex project id (009 M2). */
  projectId?: string | null;
  /** Vertex location (009 M2). */
  location?: string | null;
}

export interface SettingsLike {
  providerSettings?: Record<string, ProviderSettingsInput | undefined>;
  /**
   * Per-turn tool-call step budget override (donor settings.maxToolCallSteps).
   * Optional — runners fall back to DEFAULT_MAX_TOOL_CALL_STEPS.
   */
  maxToolCallSteps?: number;
}

function settingsApiKey(input: ProviderSettingsInput | undefined): string | null | undefined {
  if (!input) return undefined;
  if (typeof input.apiKey === "string") return input.apiKey;
  return input.apiKey?.value;
}

function settingsBaseUrl(input: ProviderSettingsInput | undefined): string | undefined {
  const raw = input?.apiBaseUrl ?? input?.baseUrl;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function env(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

export interface ResolvedConnection {
  providerId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string | undefined;
  endpoint: ReturnType<typeof endpointForModel>;
}

/**
 * Resolve a direct provider connection. Throws on unknown providers,
 * missing keys (keyed providers), missing azure resource, missing custom
 * base URL, or transports not yet wired to fetch streaming.
 */
export function resolveConnection(
  providerId: string,
  modelName: string,
  settings: SettingsLike = {},
): ResolvedConnection {
  const def = PROVIDERS[providerId];
  if (!def) throw new Error(`Unsupported model provider: ${providerId}`);
  if (def.transport === "needs-work") {
    throw new Error(
      `${def.displayName} is not on fetch streaming yet. ${def.transportNote ?? ""}`.trim(),
    );
  }
  const input = settings.providerSettings?.[providerId];
  const displayName = def.displayName;

  if (providerId === "chatgpt") {
    // Account OAuth (donor get_model_client chatgpt branch): the session
    // access token is the key. Freshness is enforced at turn start (runner
    // refreshes proactively and fails fast with a reconnect message); here
    // fail loudly when no session exists at all.
    const session = readChatGPTSession();
    if (!session) {
      throw new Error("Connect a ChatGPT account in Settings before using this model.");
    }
    return {
      providerId,
      displayName,
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKey: session.accessToken,
      endpoint: endpointForModel(modelName, "https://chatgpt.com/backend-api/codex"),
    };
  }

  if (providerId === "azure") {
    const testBase = process.env.TEST_AZURE_BASE_URL?.trim();
    const resource =
      input?.resourceName?.trim() || process.env.AZURE_RESOURCE_NAME?.trim();
    const apiKey = resolveApiKeyOrThrow(
      settingsApiKey(input) ?? env(def.envVarName),
      displayName,
    );
    if (testBase) {
      return {
        providerId,
        displayName,
        baseUrl: testBase.replace(/\/+$/, ""),
        apiKey: apiKey ?? "fake-api-key-for-testing",
        endpoint: endpointForModel(modelName, testBase),
      };
    }
    if (!resource) {
      throw new Error(
        "Azure OpenAI resource name is required. Provide it in Settings or set the AZURE_RESOURCE_NAME environment variable.",
      );
    }
    if (!apiKey) {
      throw new Error(
        "Azure OpenAI API key is required. Provide it in Settings or set the AZURE_API_KEY environment variable.",
      );
    }
    const baseUrl = `https://${resource}.openai.azure.com/openai/deployments/${modelName}`;
    return { providerId, displayName, baseUrl, apiKey, endpoint: "chat/completions" };
  }

  if (providerId === "custom") {
    const baseUrl =
      settingsBaseUrl(input) ?? (def.baseUrl ? def.baseUrl : undefined);
    if (!baseUrl) {
      throw new Error(
        `Custom provider is missing the API Base URL. Set it in Settings.`,
      );
    }
    return {
      providerId,
      displayName,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey: resolveApiKeyOrThrow(settingsApiKey(input), displayName),
      endpoint: endpointForModel(modelName, baseUrl),
    };
  }

  const baseUrl =
    settingsBaseUrl(input) ??
    (providerId === "ollama"
      ? // Donor name first (V1 OLLAMA_HOST), V2 alias accepted.
        process.env.OLLAMA_HOST?.trim() ||
        process.env.OLLAMA_BASE_URL?.trim() ||
        "http://localhost:11434/v1"
      : providerId === "lmstudio"
        ? `${process.env.LM_STUDIO_BASE_URL_FOR_TESTING?.trim() || "http://localhost:1234"}/v1`
        : def.baseUrl);
  if (!baseUrl) throw new Error(`${displayName} has no base URL configured.`);
  const apiKey = def.local
    ? undefined
    : resolveApiKeyOrThrow(settingsApiKey(input) ?? env(def.envVarName), displayName);
  if (!def.local && !apiKey) {
    throw new Error(
      `${displayName} API key is required. Provide it in Settings or set ${def.envVarName ?? "the provider key"} in the environment.`,
    );
  }
  return {
    providerId,
    displayName,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    endpoint: endpointForModel(modelName, baseUrl),
  };
}

const AUTO_KEY_ORDER = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "xai",
  "minimax",
  "deepseek",
  "opencode-zen",
] as const;

/**
 * Resolve a requested model slug to something safe to send an endpoint.
 * Placeholder slugs ("", "auto", "default") become the provider's concrete
 * default; unknown providers yield undefined so callers can fail loudly
 * instead of sending a literal "auto" that providers 404 on verbatim.
 */
export function resolveProviderDefaultModel(
  providerId: string,
  requested?: string | null,
): string | undefined {
  const slug = (requested ?? "").trim();
  if (slug !== "" && slug !== "auto" && slug !== "default") return slug;
  try {
    return getDefaultModel(providerId as ProviderKind) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Has the user configured this provider (settings key or env key)? */
export function hasProviderKey(
  providerId: string,
  settings: SettingsLike = {},
): boolean {
  const def = PROVIDERS[providerId];
  if (!def) return false;
  if (def.local === true) return true;
  // ChatGPT is session-authed (device flow), never key-authed.
  if (providerId === "chatgpt") return readChatGPTSession() !== undefined;
  const fromSettings = (settingsApiKey(settings.providerSettings?.[providerId]) ?? "").trim();
  if (fromSettings) return true;
  return Boolean(def.envVarName && env(def.envVarName));
}

/**
 * `auto` resolution: first keyed provider wins (no Pro aliases, no catalog
 * service). Falls back to keyless local runtimes, else throws telling the
 * user to add any key.
 */
export function resolveAutoProvider(settings: SettingsLike = {}): string {
  for (const id of AUTO_KEY_ORDER) {
    if (hasProviderKey(id, settings)) return id;
  }
  if (hasProviderKey("ollama", settings)) return "ollama";
  if (hasProviderKey("lmstudio", settings)) return "lmstudio";
  throw new Error(
    "No provider keys configured. Add any provider API key in Settings (or run Ollama / LM Studio locally) — every provider is free to connect.",
  );
}
