import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { success, error } from "../lib/response";
import { emitEvent } from "../lib/events";

/**
 * Background jobs (cron pattern).
 *
 * Jobs are idempotent async functions keyed by name. Trigger them from a
 * scheduler (external cron hitting POST /jobs/:name/run) or manually.
 * Every run emits structured events (job.started/finished/failed) with the
 * request id — see guides/add-realtime-jobs.md and add-observability.md.
 */

export interface JobResult {
  ok: boolean;
  message: string;
}

type JobHandler = () => Promise<JobResult>;

const jobs = new Map<string, { description: string; run: JobHandler }>();

export function registerJob(name: string, description: string, run: JobHandler): void {
  jobs.set(name, { description, run });
}

// Example job — replace with real work (expiry sweeps, digests, syncs).
registerJob("daily-digest", "Placeholder daily digest (replace with real work).", async () => {
  return { ok: true, message: "digest computed" };
});

export const jobRoutes = new Hono();

jobRoutes.get("/jobs", (c) => {
  const requestId = c.get("requestId") ?? "unknown";
  return c.json(
    success(
      [...jobs.entries()].map(([name, j]) => ({ name, description: j.description })),
      requestId,
    ),
  );
});

jobRoutes.post(
  "/jobs/:name/run",
  requireAuth(),
  zValidator("param", z.object({ name: z.string().min(1) })),
  async (c) => {
    const requestId = c.get("requestId") ?? "unknown";
    const { name } = c.req.valid("param");
    const job = jobs.get(name);
    if (!job) {
      return c.json(error("NOT_FOUND", `Unknown job: ${name}`, requestId), 404);
    }
    emitEvent({ name: "job.started", requestId, attrs: { job: name } });
    try {
      const result = await job.run();
      emitEvent({ name: "job.finished", requestId, attrs: { job: name, message: result.message } });
      return c.json(success({ job: name, ...result }, requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emitEvent({ name: "job.failed", requestId, attrs: { job: name, message } });
      return c.json(error("JOB_FAILED", message, requestId), 500);
    }
  },
);
