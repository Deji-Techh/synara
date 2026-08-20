/**
 * Classified application errors for IPC/main-process code.
 * Use {@link CaideError} with a {@link CaideErrorKind} so telemetry can ignore
 * high-volume, non-actionable failures (see `shouldFilterTelemetryException`).
 */

export enum CaideErrorKind {
  Validation = "validation",
  NotFound = "not_found",
  Auth = "auth",
  Precondition = "precondition",
  Conflict = "conflict",
  UserCancelled = "user_cancelled",
  RateLimited = "rate_limited",
  /** Upstream failures; reported to PostHog by default unless you add finer metadata later. */
  External = "external",
  /** Bugs, invariant violations, unexpected failures — always reported. */
  Internal = "internal",
  /** Unclassified; treated as reportable until call sites are migrated. */
  Unknown = "unknown",
}

const TELEMETRY_FILTERED_KINDS: ReadonlySet<CaideErrorKind> = new Set([
  CaideErrorKind.Validation,
  CaideErrorKind.NotFound,
  CaideErrorKind.Auth,
  CaideErrorKind.Precondition,
  CaideErrorKind.Conflict,
  CaideErrorKind.UserCancelled,
  CaideErrorKind.RateLimited,
]);

/**
 * Returns true if this kind should not be sent to PostHog as an `$exception` event.
 */
export function isCaideErrorKindFilteredFromTelemetry(kind: CaideErrorKind): boolean {
  return TELEMETRY_FILTERED_KINDS.has(kind);
}

export class CaideError extends Error {
  readonly kind: CaideErrorKind;
  readonly cause?: unknown;

  constructor(message: string, kind: CaideErrorKind, options?: { cause?: unknown }) {
    super(message);
    this.name = "CAIDEError";
    this.kind = kind;
    this.cause = options?.cause;
  }
}

export function isCaideError(error: unknown): error is CaideError {
  return error instanceof CaideError;
}
