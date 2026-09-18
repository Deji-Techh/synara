// FILE: promptLibrary.ts
// Purpose: User prompt library (CRUD + app assignment + @prompt expansion).
// Donor: dyad x caide prompt_handlers.ts (CRUD semantics) +
// replacePromptReference (`@prompt:<id>` stream-time expansion verbatim) —
// SQLite replaced with a file-backed global library
// (CAIDE_HOME/prompts.json); per-app assignment by app path.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

export const PROMPT_SLUG_PATTERN = /^[a-zA-Z0-9-]+$/;

export const PromptSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  description: z.string().nullable().default(null),
  content: z.string().min(1),
  slug: z.string().nullable().default(null),
  appPaths: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Prompt = z.infer<typeof PromptSchema>;

export class PromptLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptLibraryError";
  }
}

function libraryPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "prompts.json");
}

interface LibraryFile {
  nextId: number;
  prompts: Prompt[];
}

async function readLibrary(): Promise<LibraryFile> {
  try {
    const raw = await fs.promises.readFile(libraryPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<LibraryFile>;
    const prompts = Array.isArray(parsed.prompts)
      ? parsed.prompts.flatMap((p) => {
          const result = PromptSchema.safeParse(p);
          return result.success ? [result.data] : [];
        })
      : [];
    return {
      nextId:
        typeof parsed.nextId === "number" && parsed.nextId > 0
          ? Math.floor(parsed.nextId)
          : prompts.reduce((n, p) => Math.max(n, p.id), 0) + 1,
      prompts,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { nextId: 1, prompts: [] };
  }
}

async function writeLibrary(lib: LibraryFile): Promise<void> {
  const file = libraryPath();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${Date.now()}`;
  await fs.promises.writeFile(tmp, JSON.stringify(lib, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.promises.rename(tmp, file);
  await fs.promises.chmod(file, 0o600).catch(() => undefined);
}

function validateSlug(slug: string | null | undefined): string | null {
  if (slug === undefined || slug === null || slug === "") return null;
  if (!PROMPT_SLUG_PATTERN.test(slug)) {
    throw new PromptLibraryError("Slug must be letters, numbers, and hyphens only");
  }
  return slug;
}

export async function listPrompts(): Promise<Prompt[]> {
  const lib = await readLibrary();
  return lib.prompts.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listPromptsForApp(appPath: string): Promise<Prompt[]> {
  const normalized = path.normalize(appPath);
  return (await listPrompts()).filter((p) => p.appPaths.includes(normalized));
}

export async function createPrompt(input: {
  title: string;
  content: string;
  description?: string | null;
  slug?: string | null;
  appPaths?: string[];
}): Promise<Prompt> {
  if (!input.title?.trim() || !input.content?.trim()) {
    throw new PromptLibraryError("Title and content are required");
  }
  const lib = await readLibrary();
  const now = Date.now();
  const prompt: Prompt = {
    id: lib.nextId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    content: input.content,
    slug: validateSlug(input.slug),
    appPaths: (input.appPaths ?? []).map((p) => path.normalize(p)),
    createdAt: now,
    updatedAt: now,
  };
  lib.prompts.push(prompt);
  lib.nextId++;
  await writeLibrary(lib);
  return prompt;
}

export async function updatePrompt(
  id: number,
  patch: {
    title?: string;
    content?: string;
    description?: string | null;
    slug?: string | null;
    appPaths?: string[];
  },
): Promise<Prompt> {
  const lib = await readLibrary();
  const prompt = lib.prompts.find((p) => p.id === id);
  if (!prompt) throw new PromptLibraryError(`Prompt not found: ${id}`);
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new PromptLibraryError("Title must not be empty");
    prompt.title = patch.title.trim();
  }
  if (patch.content !== undefined) {
    if (!patch.content.trim()) throw new PromptLibraryError("Content must not be empty");
    prompt.content = patch.content;
  }
  if (patch.description !== undefined) prompt.description = patch.description?.trim() || null;
  if (patch.slug !== undefined) prompt.slug = validateSlug(patch.slug);
  if (patch.appPaths !== undefined) prompt.appPaths = patch.appPaths.map((p) => path.normalize(p));
  prompt.updatedAt = Date.now();
  await writeLibrary(lib);
  return prompt;
}

export async function deletePrompt(id: number): Promise<void> {
  const lib = await readLibrary();
  const index = lib.prompts.findIndex((p) => p.id === id);
  if (index === -1) throw new PromptLibraryError(`Prompt not found: ${id}`);
  lib.prompts.splice(index, 1);
  await writeLibrary(lib);
}

/**
 * Donor replacePromptReference parity: expands `@prompt:<id>` to the
 * library content; unknown ids pass through untouched (the composer shows
 * them literally rather than failing the turn).
 */
export function replacePromptReference(
  userPrompt: string,
  promptsById: Record<number | string, string>,
): string {
  if (typeof userPrompt !== "string" || userPrompt.length === 0) return userPrompt;
  return userPrompt.replace(/@prompt:(\d+)/g, (_match: string, idStr: string) => {
    const idNum = Number(idStr);
    const replacement = promptsById[idNum] ?? promptsById[idStr];
    return replacement !== undefined ? replacement : _match;
  });
}

/** Build the id→content map for expansion (optionally app-scoped). */
export async function promptContentMap(appPath?: string): Promise<Record<number, string>> {
  const prompts = appPath ? await listPromptsForApp(appPath) : await listPrompts();
  const map: Record<number, string> = {};
  for (const prompt of prompts) map[prompt.id] = prompt.content;
  return map;
}
