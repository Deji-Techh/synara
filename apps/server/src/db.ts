// apps/server/src/db.ts — Real Sqlite persistence via bun:sqlite
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");
const DB_PATH = join(CAIDE_HOME, "caide.db");

mkdirSync(CAIDE_HOME, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    framework TEXT NOT NULL DEFAULT 'blank',
    workspace_root TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    thread_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'New thread',
    status TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface Project { id: string; name: string; framework: string; workspace_root: string; updated_at: string; thread_count: number }
export interface Thread { id: string; project_id: string; title: string; status: string; created_at: string }
export interface Message { id: string; thread_id: string; role: string; content: string; created_at: string }

export function loadProjects(): Project[] {
  return db.query("SELECT * FROM projects ORDER BY updated_at DESC").all() as Project[];
}

export function getProject(id: string): Project | undefined {
  return db.query("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function createProject(p: Project): void {
  db.query("INSERT INTO projects (id, name, framework, workspace_root, updated_at, thread_count) VALUES (?, ?, ?, ?, ?, ?)").run(p.id, p.name, p.framework, p.workspace_root, p.updated_at, p.thread_count);
}

export function deleteProject(id: string): void {
  db.query("DELETE FROM projects WHERE id = ?").run(id);
}

export function updateProject(id: string, updates: Partial<Project>): void {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(", ");
  const values = Object.values(updates);
  db.query(`UPDATE projects SET ${sets} WHERE id = ?`).run(...values, id);
}

export function loadThreads(): Thread[] {
  return db.query("SELECT * FROM threads ORDER BY created_at DESC").all() as Thread[];
}

export function getThreadsByProject(projectId: string): Thread[] {
  return db.query("SELECT * FROM threads WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Thread[];
}

export function getThread(id: string): Thread | undefined {
  return db.query("SELECT * FROM threads WHERE id = ?").get(id) as Thread | undefined;
}

export function createThread(t: Thread): void {
  db.query("INSERT INTO threads (id, project_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)").run(t.id, t.project_id, t.title, t.status, t.created_at);
}

export function updateThread(id: string, updates: Partial<Thread>): void {
  const sets = Object.entries(updates).map(([k]) => `${k} = ?`).join(", ");
  const values = Object.values(updates);
  db.query(`UPDATE threads SET ${sets} WHERE id = ?`).run(...values, id);
}

export function getMessagesByThread(threadId: string): Message[] {
  return db.query("SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC").all(threadId) as Message[];
}

export function createMessage(m: Message): void {
  db.query("INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)").run(m.id, m.thread_id, m.role, m.content, m.created_at);
}

export function closeDb(): void {
  db.close();
}
