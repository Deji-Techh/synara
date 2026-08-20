/**
 * Shared utility for making fetch requests to the Caide engine API.
 * Handles common headers including Authorization and X-Caide-Request-Id.
 */

import { readSettings } from "@/main/settings";
import type { AgentContext } from "./types";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { getCaideEngineBaseUrl } from "@/ipc/utils/caide_engine_url";

export interface EngineFetchOptions extends Omit<RequestInit, "headers"> {
  /** Additional headers to include */
  headers?: Record<string, string>;
}

/**
 * Fetch wrapper for Caide engine API calls.
 * Automatically adds Authorization and X-Caide-Request-Id headers.
 *
 * @param ctx - The agent context containing the request ID
 * @param endpoint - The API endpoint path (e.g., "/tools/web-search")
 * @param options - Fetch options (method, body, additional headers, etc.)
 * @returns The fetch Response
 * @throws Error if CAIDE Gateway API key is not configured
 */
export async function engineFetch(
  ctx: Pick<AgentContext, "caideRequestId">,
  endpoint: string,
  options: EngineFetchOptions = {},
): Promise<Response> {
  const settings = readSettings();
  const apiKey = settings.providerSettings?.auto?.apiKey?.value;

  if (!apiKey) {
    throw new CaideError("CAIDE Gateway API key is required", CaideErrorKind.Auth);
  }

  const { headers: extraHeaders, ...restOptions } = options;

  return fetch(`${getCaideEngineBaseUrl()}${endpoint}`, {
    ...restOptions,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Caide-Request-Id": ctx.caideRequestId,
      ...extraHeaders,
    },
  });
}
