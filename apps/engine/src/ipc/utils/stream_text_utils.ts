import log from "electron-log";
import { Output } from "ai";
import type { StreamingPatch } from "@/ipc/types";
import { hashPrefix } from "@/lib/prefixHash";

const logger = log.scope("stream_text_utils");

/**
 * Drop-in replacement for the AI SDK's default `Output.text()` that avoids an
 * O(n^2) cost in `streamText`'s `fullStream`.
 *
 * `streamText` always pipes `fullStream` through `createOutputTransformStream`.
 * With no `output` configured it defaults to `Output.text()`, whose
 * `parsePartialOutput` returns the whole accumulated text as `partial`. On every
 * text-delta the transform then runs `JSON.stringify(partial)` and diffs it
 * against the previous value to decide whether to emit a `partialOutput`, so
 * that stringify+diff is O(n) per chunk, O(n^2) over a long response. On large
 * multi-file generations this saturates the main process's JS thread and
 * freezes the app.
 *
 * We read `fullStream` parts directly and never consume `partialOutput`, so the
 * work is pure waste. This returns an O(1) value that still changes every chunk
 * (the text length), which keeps text flushing incrementally while making the
 * per-chunk work O(1). (Returning `undefined` would instead make text flush only
 * at block end, breaking streaming.) `responseFormat` is unchanged, so the model
 * request is identical.
 */
export function fastTextOutput(): ReturnType<typeof Output.text> {
  const base = Output.text();
  return {
    ...base,
    // `text` is the SDK's append-only accumulated output, so its length strictly
    // increases: the value changes every chunk (keeping text flushing) while
    // staying O(1) to stringify and diff.
    parsePartialOutput: async ({ text }: { text: string }) => ({
      partial: text.length,
    }),
    // `partial` is intentionally a number, not the base `Output.text()` string.
    // Safe because nothing consumes `partialOutput`; we only use it as a cheap
    // per-chunk change signal to drive flushing. This holds as of ai@6.0.68;
    // worth rechecking on AI SDK version bumps.
  } as unknown as ReturnType<typeof Output.text>;
}

/**
 * Incremental djb2 hash update: folds `suffix` into an existing `hashPrefix`
 * accumulator. Only valid when the string whose hash is being tracked grows by
 * appending `suffix` (never when earlier bytes are rewritten), since djb2 is a
 * left-fold over characters.
 */
function appendHash(hash: number, suffix: string): number {
  for (let i = 0; i < suffix.length; i++) {
    hash = (((hash << 5) + hash) ^ suffix.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Persistent tracker for tail-only streaming patches.
 *
 * The one-shot `computeStreamingPatch` re-scans the agreed prefix from byte 0
 * (LCP) and then re-hashes it (`hashPrefix`) on every chunk — two O(n) passes
 * per chunk, O(n^2) over a long streaming response. The tracker remembers the
 * previous target and its rolling djb2 hash, so the common pure-append chunk is
 * handled with a single memcmp-vectorized `startsWith` check plus an O(tail)
 * rolling-hash update — skipping both full-length passes.
 *
 * When the new target retroactively rewrites earlier bytes (e.g. a
 * `cleanFullResponse` rewrite inside an in-progress caide-tag attribute value),
 * it falls back to a full LCP + hash recomputation from byte 0, which preserves
 * the `offset < oldLen` divergence semantics callers rely on. Emits exactly the
 * same patches as `computeStreamingPatch` for any input sequence.
 */
export class StreamingPatchTracker {
  private lastTarget: string;
  private lastTargetHash: number;

  constructor(initialTarget = "") {
    this.lastTarget = initialTarget;
    this.lastTargetHash = hashPrefix(initialTarget, initialTarget.length);
  }

  /** Length of the last target this tracker emitted a patch for. */
  get lastTargetLength(): number {
    return this.lastTarget.length;
  }

  /** Hard-resync the baseline (e.g. after a full-messages replacement send). */
  reset(fullResponse: string): void {
    this.lastTarget = fullResponse;
    this.lastTargetHash = hashPrefix(fullResponse, fullResponse.length);
  }

  update(fullResponse: string): StreamingPatch | null {
    const prev = this.lastTarget;
    if (fullResponse === prev) return null;

    // Fast path: pure append. `startsWith` verifies the agreed prefix in a
    // single vectorized pass, and the agreed-prefix hash is the stored hash of
    // `prev` — no second O(n) hashPrefix pass. The stored hash is then rolled
    // forward over only the newly-appended bytes.
    if (fullResponse.startsWith(prev)) {
      const content = fullResponse.slice(prev.length);
      const patch: StreamingPatch = {
        offset: prev.length,
        content,
        prefixHash: prev.length > 0 ? this.lastTargetHash : undefined,
      };
      this.lastTarget = fullResponse;
      this.lastTargetHash = appendHash(this.lastTargetHash, content);
      return patch;
    }

    // Slow path: the new target rewrites earlier bytes. Recompute the LCP from
    // byte 0 and re-hash the agreed prefix from scratch.
    let lcp = 0;
    const maxLcp = Math.min(prev.length, fullResponse.length);
    while (
      lcp < maxLcp &&
      prev.charCodeAt(lcp) === fullResponse.charCodeAt(lcp)
    ) {
      lcp++;
    }
    this.lastTarget = fullResponse;
    this.lastTargetHash = hashPrefix(fullResponse, fullResponse.length);
    return {
      offset: lcp,
      content: fullResponse.slice(lcp),
      prefixHash: lcp > 0 ? hashPrefix(fullResponse, lcp) : undefined,
    };
  }
}

/**
 * Computes a tail-only streaming patch from `lastSentContent` to `fullResponse`
 * using longest-common-prefix. Returns null when nothing changed.
 *
 * The renderer reconstructs the full string as `current.slice(0, offset) + content`.
 * We use LCP rather than assuming pure appends because `cleanFullResponse` may
 * retroactively rewrite bytes inside in-progress caide-tag attribute values.
 * Kept as a thin one-shot wrapper over `StreamingPatchTracker`; hot streaming
 * paths should reuse a persistent tracker instead.
 */
export function computeStreamingPatch(
  fullResponse: string,
  lastSentContent: string,
): StreamingPatch | null {
  return new StreamingPatchTracker(lastSentContent).update(fullResponse);
}

/**
 * Cancel the orphaned `baseStream` tee branch the AI SDK leaves behind
 * after `.fullStream` is read.
 *
 * Reading `.fullStream` runs the SDK's `teeStream()` synchronously: it
 * splits the SDK's internal `baseStream` into two branches and
 * reassigns the unread branch back onto `streamResult.baseStream`.
 * WhatWG `tee()` enqueues every upstream chunk into both branches'
 * controllers regardless of whether they have a reader, so the unread
 * branch's queue grows unbounded as the model streams — the dominant
 * in-flight memory leak observed in heap snapshots (`{part,
 * partialOutput}` objects parked in a `ReadableStreamDefaultController`
 * queue, rooted via the undici connection pool).
 *
 * Call this immediately after reading `.fullStream` and before the
 * stream begins pumping chunks. The cancel runs before any chunks are
 * pumped, so the orphan controller closes immediately and future
 * enqueues to it are no-ops.
 */
export function cancelOrphanedBaseStream(streamResult: unknown): void {
  const orphan: any = streamResult;
  orphan?.baseStream?.cancel?.()?.catch?.((err: unknown) => {
    logger.warn("Failed to cancel orphaned streamText baseStream branch", err);
  });
}
