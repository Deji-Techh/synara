/**
 * Structured domain events (observability helper).
 *
 * Stable event names, request/trace IDs on every entry, auth material never
 * logged. Emit JSON to stdout — the platform drains it (see
 * guides/add-observability.md). Keep payloads small and scrubbed.
 */

export interface DomainEvent {
  name: string;
  requestId: string;
  release?: string;
  attrs?: Record<string, string | number | boolean | null>;
}

const SENSITIVE_KEYS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
];

function scrub(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.some((re) => re.test(k)) ? "[redacted]" : scrub(v);
  }
  return out;
}

export function emitEvent(event: DomainEvent): void {
  const entry = {
    ts: new Date().toISOString(),
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    ...event,
    attrs: scrub(event.attrs ?? {}) as Record<string, string | number | boolean | null>,
  };
  console.log(JSON.stringify(entry));
}
