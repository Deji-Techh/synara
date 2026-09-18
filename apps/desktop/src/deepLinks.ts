// FILE: deepLinks.ts
// Purpose: caide:// (+ dyad:// compat) deep-link routing: protocol
// registration, cold-start-safe dispatch (argv/open-url/second-instance),
// and forwarding to the renderer over IPC.
// Donor: dyad x caide deep_link_data.ts + deep_link_queue.ts + main.ts
// protocol wiring. Routes: neon-oauth-return, supabase-oauth-return
// (Dyad-hosted broker callbacks per 013), mcp-oauth-return, add-mcp-server,
// add-prompt, receive-project. dyad-pro-return is dropped (no Pro — 007 §7).

export const DEEP_LINK_SCHEMES = ["caide", "dyad"] as const;

export type DeepLinkRoute =
  | { type: "neon-oauth-return"; query: Record<string, string> }
  | { type: "supabase-oauth-return"; query: Record<string, string> }
  | { type: "mcp-oauth-return"; query: Record<string, string> }
  | { type: "add-mcp-server"; payload: Record<string, unknown> }
  | { type: "add-prompt"; payload: Record<string, unknown> }
  | { type: "receive-project"; token: string }
  | { type: "unknown"; raw: string };

function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) query[key] = value;
  return query;
}

function parseJsonParam(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Donor deep-link routing parity. Accepts caide:// and dyad:// URLs;
 * anything else (or unparsable input) yields { type: "unknown" } instead
 * of throwing — a stray OS open must never crash dispatch.
 */
export function parseDeepLink(raw: string): DeepLinkRoute {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { type: "unknown", raw };
  }
  const scheme = url.protocol.replace(/:$/, "");
  if (scheme !== "caide" && scheme !== "dyad") return { type: "unknown", raw };
  // caide://route?x=1 and caide:///route?x=1 both occur across platforms.
  const route = (
    url.hostname ||
    url.pathname.replace(/^\/+/, "").split("/")[0] ||
    ""
  ).toLowerCase();
  const query = parseQuery(url.search);
  switch (route) {
    case "neon-oauth-return":
      return { type: "neon-oauth-return", query };
    case "supabase-oauth-return":
      return { type: "supabase-oauth-return", query };
    case "mcp-oauth-return":
      return { type: "mcp-oauth-return", query };
    case "add-mcp-server":
      return { type: "add-mcp-server", payload: parseJsonParam(query["data"] ?? null) };
    case "add-prompt":
      return { type: "add-prompt", payload: parseJsonParam(query["data"] ?? null) };
    case "receive-project": {
      const token = query["token"] ?? "";
      if (!token) return { type: "unknown", raw };
      return { type: "receive-project", token };
    }
    default:
      return { type: "unknown", raw };
  }
}

/** Extract candidate deep-link URLs from a process argv array. */
export function deepLinksFromArgv(argv: string[]): string[] {
  return argv.filter((arg) => {
    const lower = arg.toLowerCase();
    return lower.startsWith("caide://") || lower.startsWith("dyad://");
  });
}

/**
 * Cold-start-safe dispatch queue (donor deep_link_queue.ts parity):
 * links arriving before the window/renderer exist wait here; the first
 * ready consumer drains them in order.
 */
export function createDeepLinkQueue(): {
  push(raw: string): void;
  drain(): DeepLinkRoute[];
  size(): number;
} {
  const pending: string[] = [];
  return {
    push(raw: string) {
      pending.push(raw);
    },
    drain() {
      return pending.splice(0, pending.length).map(parseDeepLink);
    },
    size() {
      return pending.length;
    },
  };
}
