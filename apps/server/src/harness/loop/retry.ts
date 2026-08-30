export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export function isRecoverableError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof Error) {
    // Aborted operations are never retried
    if (error.name === "AbortError") return false;

    const msg = error.message.toLowerCase();
    const code = (error as any).code?.toLowerCase?.() ?? "";
    const status = (error as any).status ?? (error as any).statusCode;

    // HTTP Rate limits and transient server errors
    if (status === 429 || status === 502 || status === 503 || status === 504 || status === 529) {
      return true;
    }

    // Explicit non-recoverable HTTP client errors
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return false;
    }

    // Common transient network errors
    if (
      code === "etimedout" ||
      code === "econnreset" ||
      code === "enotfound" ||
      code === "econnrefused" ||
      code === "epipe" ||
      code === "und_err_connect_timeout"
    ) {
      return true;
    }

    if (
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("overloaded") ||
      msg.includes("service unavailable") ||
      msg.includes("gateway timeout") ||
      msg.includes("transient") ||
      msg.includes("connection reset") ||
      msg.includes("fetch failed")
    ) {
      return true;
    }
  }

  return false;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const backoffFactor = options.backoffFactor ?? 2;
  const shouldRetry = options.shouldRetry ?? isRecoverableError;

  let attempt = 1;
  let delay = initialDelayMs;

  while (true) {
    if (options.signal?.aborted) {
      throw new Error("Operation aborted");
    }

    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetry(err, attempt) || options.signal?.aborted) {
        throw err;
      }

      if (options.onRetry) {
        options.onRetry(err, attempt, delay);
      }

      // Wait with abort signal support
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (options.signal) {
            options.signal.removeEventListener("abort", onAbort);
          }
          resolve();
        }, delay);

        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("Operation aborted during retry backoff"));
        };

        if (options.signal) {
          if (options.signal.aborted) {
            clearTimeout(timer);
            return reject(new Error("Operation aborted"));
          }
          options.signal.addEventListener("abort", onAbort, { once: true });
        }
      });

      attempt += 1;
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }
}
