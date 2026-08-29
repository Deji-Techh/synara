// apps/server/src/main.ts — Pure Caide server with real Sqlite persistence
import { handleVerifySlice } from "./harness/wsCaide";
import { handleStreamProvider, handleVerifySliceHttp } from "./harness/streamEndpoint";
import {
  loadProjects, getProject, createProject, deleteProject, updateProject,
  loadThreads, getThreadsByProject, getThread, createThread, updateThread,
  getMessagesByThread, createMessage,
  type Project, type Thread, type Message,
} from "./db";

const PORT = parseInt(process.env.CAIDE_PORT ?? "58080", 10);
const HOST = process.env.CAIDE_HOST ?? "127.0.0.1";

// ── Filesystem helpers ────────────────────────────────────────────────
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");

async function ensureDir(p: string) { await mkdir(p, { recursive: true }); }

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
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    }

    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const text = (msg: string, status = 200) => new Response(msg, { status, headers: { "Access-Control-Allow-Origin": "*" } });

    try {
      // ── Health ──
      if (url.pathname === "/health" && method === "GET") {
        return json({ status: "ok", harness: "pure-caide", version: "0.1.0", db: "sqlite" });
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
        return json(loadProjects());
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
        await writeFile(join(workspaceRoot, ".caide"), JSON.stringify({ framework })).catch(() => {});
        const project: Project = { id, name, framework, workspace_root: workspaceRoot, updated_at: new Date().toISOString(), thread_count: 0 };
        createProject(project);
        const threadId = `thread-${Date.now().toString(36)}`;
        const thread: Thread = { id: threadId, project_id: id, title: name, status: "idle", created_at: new Date().toISOString() };
        createThread(thread);
        updateProject(id, { thread_count: 1 });
        return json({ projectId: id, threadId, framework, workspaceRoot });
      }

      // ── DELETE /api/harness/projects/:id ──
      const delMatch = url.pathname.match(/^\/api\/harness\/projects\/([^/]+)$/);
      if (delMatch && method === "DELETE") {
        const projectId = delMatch[1]!;
        const project = getProject(projectId);
        if (!project) return json({ error: "Project not found" }, 404);
        deleteProject(projectId);
        return json({ deleted: projectId });
      }

      // ── POST /api/harness/thread ──
      if (url.pathname === "/api/harness/thread" && method === "POST") {
        const body = await req.json().catch(() => ({})) as { projectId?: string; title?: string };
        const projectId = body.projectId as string;
        const title = (body.title as string) ?? "New thread";
        const threadId = `thread-${Date.now().toString(36)}`;
        const thread: Thread = { id: threadId, project_id: projectId, title, status: "idle", created_at: new Date().toISOString() };
        createThread(thread);
        const project = getProject(projectId);
        if (project) {
          updateProject(projectId, { thread_count: project.thread_count + 1, updated_at: new Date().toISOString() });
        }
        return json({ threadId, projectId, title });
      }

      // ── PATCH /api/harness/threads/:id ──
      const patchMatch = url.pathname.match(/^\/api\/harness\/threads\/([^/]+)$/);
      if (patchMatch && method === "PATCH") {
        const threadId = patchMatch[1]!;
        const body = await req.json().catch(() => ({})) as { status?: string; title?: string };
        const thread = getThread(threadId);
        if (!thread) return json({ error: "Thread not found" }, 404);
        const updates: Partial<Thread> = {};
        if (body.status) updates.status = body.status;
        if (body.title) updates.title = body.title;
        updateThread(threadId, updates);
        return json(getThread(threadId));
      }

      // ── GET /api/harness/projects/:id/threads ──
      const threadMatch = url.pathname.match(/^\/api\/harness\/projects\/([^/]+)\/threads$/);
      if (threadMatch && method === "GET") {
        const projectId = threadMatch[1]!;
        return json(getThreadsByProject(projectId));
      }

      // ── GET /api/harness/projects/:id/files ──
      const filesMatch = url.pathname.match(/^\/api\/harness\/projects\/([^/]+)\/files$/);
      if (filesMatch && method === "GET") {
        const projectId = filesMatch[1]!;
        const project = getProject(projectId);
        if (!project) return json({ error: "Project not found" }, 404);
        const files = await readdir(project.workspace_root, { recursive: true }).catch(() => []);
        return json(files);
      }

      // ── GET /api/harness/threads/:id/messages ──
      const msgMatch = url.pathname.match(/^\/api\/harness\/threads\/([^/]+)\/messages$/);
      if (msgMatch && method === "GET") {
        const threadId = msgMatch[1]!;
        return json(getMessagesByThread(threadId));
      }

      // ── POST /api/harness/threads/:id/messages ──
      if (msgMatch && method === "POST") {
        const threadId = msgMatch[1]!;
        const body = await req.json().catch(() => ({})) as { role?: string; content?: string };
        const message: Message = {
          id: `msg-${Date.now().toString(36)}`,
          thread_id: threadId,
          role: body.role ?? "user",
          content: body.content ?? "",
          created_at: new Date().toISOString(),
        };
        createMessage(message);
        return json(message);
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
console.log(`    GET    /health`);
console.log(`    GET    /api/harness/projects`);
console.log(`    POST   /api/harness/project {name, framework}`);
console.log(`    DELETE /api/harness/projects/:id`);
console.log(`    GET    /api/harness/projects/:id/threads`);
console.log(`    GET    /api/harness/projects/:id/files`);
console.log(`    POST   /api/harness/thread {projectId, title}`);
console.log(`    PATCH  /api/harness/threads/:id {status, title}`);
console.log(`    GET    /api/harness/threads/:id/messages`);
console.log(`    POST   /api/harness/threads/:id/messages {role, content}`);
console.log(`    POST   /api/harness/stream (SSE typed {token})`);
console.log(`    POST   /api/harness/verify (JSON handleVerifySlice)`);
console.log();
