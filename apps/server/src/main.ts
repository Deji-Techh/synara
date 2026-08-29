// apps/server/src/main.ts — Pure Caide server
import { getCaideRunner, handleVerifySlice } from "./harness/wsCaide";
import { CaideHarness } from "./harness/harnessRun";
import { handleStreamProvider, handleVerifySliceHttp } from "./harness/streamEndpoint";

const PORT = parseInt(process.env.CAIDE_PORT ?? "58080", 10);
const HOST = process.env.CAIDE_HOST ?? "127.0.0.1";
const HOME = process.env.CAIDE_HOME ?? `${process.env.HOME}/caide-apps`;

// ── Filesystem helpers ────────────────────────────────────────────────
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");

async function ensureDir(p: string) { await mkdir(p, { recursive: true }); }
async function readJson(p: string): Promise<any> { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } }
async function writeJson(p: string, data: unknown) { await writeFile(p, JSON.stringify(data, null, 2), "utf8"); }

// ── Project/Thread store (simple JSON file, no Sqlite yet) ──────────
interface Project { id: string; name: string; framework: string; workspaceRoot: string; updatedAt: string; threadCount: number }
interface Thread { id: string; projectId: string; title: string; status: string; createdAt: string }

const PROJECTS_FILE = join(CAIDE_HOME, "projects.json");
const THREADS_FILE = join(CAIDE_HOME, "threads.json");

async function loadProjects(): Promise<Project[]> { return (await readJson(PROJECTS_FILE)) ?? []; }
async function saveProjects(projects: Project[]) { await ensureDir(CAIDE_HOME); await writeJson(PROJECTS_FILE, projects); }
async function loadThreads(): Promise<Thread[]> { return (await readJson(THREADS_FILE)) ?? []; }
async function saveThreads(threads: Thread[]) { await ensureDir(CAIDE_HOME); await writeJson(THREADS_FILE, threads); }

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || `app-${Date.now().toString(36)}`;
}

// ── Server routes ────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const method = req.method;

    // CORS
    if (method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const text = (msg: string, status = 200) => new Response(msg, { status, headers: { "Access-Control-Allow-Origin": "*" } });

    try {
      // ── Health ──
      if (url.pathname === "/health" && method === "GET") {
        return json({ status: "ok", harness: "pure-caide", version: "0.1.0" });
      }

      // ── Harness stream (SSE) — real provider + harness loop ──
      if (url.pathname === "/api/harness/stream" && method === "POST") {
        return handleStreamProvider(req);
      }

      // ── Verify slice ──
      if (url.pathname === "/api/harness/verify" && method === "POST") {
        return handleVerifySliceHttp(req);
      }

      // ── GET /api/harness/projects ──
      if (url.pathname === "/api/harness/projects" && method === "GET") {
        const projects = await loadProjects();
        return json(projects);
      }

      // ── POST /api/harness/project ──
      if (url.pathname === "/api/harness/project" && method === "POST") {
        const body = await req.json().catch(() => ({})) as { name?: string; framework?: string };
        const name = (body.name as string)?.trim() || "New project";
        const framework = (body.framework as string) ?? "blank";
        const id = `project-${Date.now().toString(36)}`;
        const slug = slugify(name);
        const workspaceRoot = join(CAIDE_HOME, slug);
        await ensureDir(workspaceRoot);
        await writeFile(join(workspaceRoot, "README.md"), `# ${name}\n\nCaide project — ${framework}\n`).catch(() => {});
        if (framework !== "blank") {
          const pkgName = framework === "flutter" ? "pubspec.yaml" : "package.json";
          const pkg = framework === "flutter"
            ? `name: ${slug.replace(/-/g, "_")}\nflutter:\n  uses-material-design: true\n`
            : JSON.stringify({ name: slug, scripts: { dev: framework === "website" ? "vite" : "expo start" } }, null, 2);
          await writeFile(join(workspaceRoot, pkgName), pkg).catch(() => {});
        }
        await writeJson(join(workspaceRoot, ".caide"), { framework });
        const project: Project = { id, name, framework, workspaceRoot, updatedAt: new Date().toISOString(), threadCount: 0 };
        const projects = await loadProjects(); projects.push(project); await saveProjects(projects);
        const threadId = `thread-${Date.now().toString(36)}`;
        const thread: Thread = { id: threadId, projectId: id, title: name, status: "idle", createdAt: new Date().toISOString() };
        const threads = await loadThreads(); threads.push(thread); await saveThreads(threads);
        project.threadCount = 1; await saveProjects(projects);
        return json({ projectId: id, threadId, framework, workspaceRoot });
      }

      // ── POST /api/harness/thread ──
      if (url.pathname === "/api/harness/thread" && method === "POST") {
        const body = await req.json().catch(() => ({})) as { projectId?: string; title?: string };
        const projectId = body.projectId as string; const title = (body.title as string) ?? "New thread";
        const threadId = `thread-${Date.now().toString(36)}`;
        const thread: Thread = { id: threadId, projectId, title, status: "idle", createdAt: new Date().toISOString() };
        const threads = await loadThreads(); threads.push(thread); await saveThreads(threads);
        const projects = await loadProjects(); const p = projects.find((x) => x.id === projectId); if (p) { p.threadCount++; p.updatedAt = new Date().toISOString(); await saveProjects(projects); }
        return json({ threadId, projectId, title });
      }

      // ── GET /api/harness/projects/:id/threads ──
      const threadMatch = url.pathname.match(/^\/api\/harness\/projects\/([^/]+)\/threads$/);
      if (threadMatch && method === "GET") {
        const projectId = threadMatch[1];
        const threads = await loadThreads();
        return json(threads.filter((t) => t.projectId === projectId));
      }

      // ── Static files (built web app) ──
      const staticDir = join(import.meta.dir, "../apps/web/dist");
      const filePath = join(staticDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (await stat(filePath).then(() => true).catch(() => false)) {
        const ext = filePath.split(".").pop() ?? "";
        const types: Record<string, string> = { html: "text/html", css: "text/css", js: "application/javascript", json: "application/json", png: "image/png", ico: "image/x-icon" };
        return new Response(Bun.file(filePath), { headers: { "Content-Type": types[ext] ?? "application/octet-stream" } });
      }

      return text("Not Found", 404);
    } catch (err) {
      return json({ error: (err as Error).message }, 500);
    }
  },
});

console.log(`\n  ✦ Pure Caide server running at http://${server.hostname}:${server.port}\n`);
console.log(`    GET  /health`);
console.log(`    GET  /api/harness/projects`);
console.log(`    POST /api/harness/project {name, framework}`);
console.log(`    POST /api/harness/thread  {projectId, title}`);
console.log(`    GET  /api/harness/projects/:id/threads`);
console.log(`    POST /api/harness/stream  (SSE typed {token})`);
console.log(`    POST /api/harness/verify  (JSON handleVerifySlice)`);
console.log();
