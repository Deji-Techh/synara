import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { pool } from "./db.js";
import { authenticateSession } from "./auth.js";
import { hashToken } from "./security.js";
import { signedDownloadUrl } from "./storage.js";

const ShareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function requireAuth(
  req: { header(name: string): string | undefined },
): Promise<{ id: string; email: string; name: string | null }> {
  const user = await authenticateSession(req);
  if (!user) throw httpError(401, "Authentication required");
  return user;
}

/**
 * Parse a raw concatenated file format into individual files.
 * Each entry has:
 *   - 4 bytes: path length (uint32 BE)
 *   - N bytes: file path (utf-8)
 *   - 4 bytes: content length (uint32 BE)
 *   - N bytes: file content (utf-8)
 */
function parseCaidepkg(
  buffer: Buffer,
): Array<{ path: string; name: string; extension: string; content: string; size: number; fileType: "file" | "directory" }> {
  const files: Array<{ path: string; name: string; extension: string; content: string; size: number; fileType: "file" | "directory" }> = [];
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    const pathLen = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + pathLen > buffer.length) break;

    const filePath = buffer.toString("utf-8", offset, offset + pathLen);
    offset += pathLen;

    if (offset + 4 > buffer.length) break;
    const contentLen = buffer.readUInt32BE(offset);
    offset += 4;
    if (offset + contentLen > buffer.length) break;

    const content = buffer.toString("utf-8", offset, offset + contentLen);
    offset += contentLen;

    const parts = filePath.split("/");
    const lastPart = parts[parts.length - 1] ?? "";
    const secondLast = parts[parts.length - 2] ?? "";
    const rawName = lastPart || secondLast || filePath;
    const dotIdx = rawName.lastIndexOf(".");
    const extension = dotIdx > 0 ? rawName.slice(dotIdx + 1) : "";
    const isDir = filePath.endsWith("/");

    files.push({
      path: filePath,
      name: rawName,
      extension,
      content: isDir ? "" : content,
      size: Buffer.byteLength(content),
      fileType: isDir ? "directory" : "file",
    });
  }

  // Infer directories from file paths
  const dirSet = new Set<string>();
  const dirEntries: typeof files = [];
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      if (dirPath && !dirSet.has(dirPath)) {
        dirSet.add(dirPath);
        dirEntries.push({
          path: dirPath + "/",
          name: parts[i - 1] ?? "",
          extension: "",
          content: "",
          size: 0,
          fileType: "directory",
        });
      }
    }
  }

  return [...files, ...dirEntries];
}

/**
 * Try to decompress gzip; if it's not gzip, use as-is (raw concatenated format).
 */
async function extractPackage(
  raw: Buffer,
): Promise<Array<{ path: string; name: string; extension: string; content: string; size: number; fileType: "file" | "directory" }>> {
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    const { gunzip } = await import("node:zlib");
    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      gunzip(raw, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    return parseCaidepkg(decompressed);
  }
  return parseCaidepkg(raw);
}

function getWildcardPath(reqParams: Record<string, string | undefined>): string {
  // Express stores wildcard params both as numeric index and named key
  const params = reqParams as unknown as Record<string, string>;
  return params["0"] || params.path || "";
}

export function registerProjectRoutes(app: Express): void {
  // GET /v1/projects — list all projects for authenticated user
  app.get("/v1/projects", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const result = await pool.query(
        `SELECT id, name, description, share_id, preview_url, thumbnail_url,
                file_count, total_size, created_at, updated_at
           FROM user_projects
          WHERE user_id = $1
          ORDER BY updated_at DESC`,
        [user.id],
      );
      const projects = result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        shareId: row.share_id,
        previewUrl: row.preview_url,
        thumbnailUrl: row.thumbnail_url,
        fileCount: row.file_count,
        totalSize: Number(row.total_size),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }));
      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  // GET /v1/projects/:id — get single project with file list
  app.get("/v1/projects/:id", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const projectId = req.params.id;

      const projectResult = await pool.query(
        `SELECT id, name, description, share_id, preview_url, thumbnail_url,
                file_count, total_size, created_at, updated_at
           FROM user_projects
          WHERE id = $1 AND user_id = $2`,
        [projectId, user.id],
      );
      const project = projectResult.rows[0];
      if (!project) {
        throw httpError(404, "Project not found");
      }

      const filesResult = await pool.query(
        `SELECT path, name, extension, size, file_type
           FROM project_files
          WHERE project_id = $1
          ORDER BY path`,
        [projectId],
      );

      res.json({
        id: project.id,
        name: project.name,
        description: project.description,
        shareId: project.share_id,
        previewUrl: project.preview_url,
        thumbnailUrl: project.thumbnail_url,
        fileCount: project.file_count,
        totalSize: Number(project.total_size),
        createdAt: project.created_at.toISOString(),
        updatedAt: project.updated_at.toISOString(),
        files: filesResult.rows.map((f) => ({
          path: f.path,
          name: f.name,
          extension: f.extension,
          size: Number(f.size),
          type: f.file_type,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /v1/projects/:id/files — list files for a project
  app.get("/v1/projects/:id/files", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const projectId = req.params.id;

      const projectResult = await pool.query(
        `SELECT id FROM user_projects WHERE id = $1 AND user_id = $2`,
        [projectId, user.id],
      );
      if (!projectResult.rows[0]) {
        throw httpError(404, "Project not found");
      }

      const filesResult = await pool.query(
        `SELECT path, name, extension, size, file_type
           FROM project_files
          WHERE project_id = $1
          ORDER BY path`,
        [projectId],
      );

      res.json(
        filesResult.rows.map((f) => ({
          path: f.path,
          name: f.name,
          extension: f.extension,
          size: Number(f.size),
          type: f.file_type,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  // GET /v1/projects/:id/files/*path — get content of a single file
  app.get("/v1/projects/:id/files/*path", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const projectId = req.params.id;
      const filePath = getWildcardPath(req.params);

      const projectResult = await pool.query(
        `SELECT id FROM user_projects WHERE id = $1 AND user_id = $2`,
        [projectId, user.id],
      );
      if (!projectResult.rows[0]) {
        throw httpError(404, "Project not found");
      }

      const fileResult = await pool.query(
        `SELECT path, name, extension, content, size, file_type
           FROM project_files
          WHERE project_id = $1 AND path = $2`,
        [projectId, filePath],
      );
      const file = fileResult.rows[0];
      if (!file) {
        throw httpError(404, "File not found");
      }

      const languageMap: Record<string, string> = {
        ts: "typescript",
        tsx: "tsx",
        js: "javascript",
        jsx: "jsx",
        json: "json",
        css: "css",
        scss: "scss",
        html: "html",
        md: "markdown",
        sql: "sql",
        py: "python",
        rs: "rust",
        go: "go",
        java: "java",
        rb: "ruby",
        yaml: "yaml",
        yml: "yaml",
        toml: "toml",
        sh: "shell",
        bash: "shell",
        env: "dotenv",
      };

      const language = languageMap[file.extension.toLowerCase()] ?? "plaintext";

      res.json({
        path: file.path,
        content: file.content,
        language,
        size: Number(file.size),
        type: file.file_type,
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /v1/shares/:token/import — import a share into a user's project
  app.post("/v1/shares/:token/import", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const token = req.params.token;

      if (!ShareTokenSchema.safeParse(token).success) {
        throw httpError(404, "Invalid share token");
      }

      const { findShareByPublicTokenHash } = await import("./db.js");
      const shareRow = await findShareByPublicTokenHash(hashToken(token));
      if (!shareRow) {
        throw httpError(404, "Share not found");
      }
      if (shareRow.status !== "active") {
        throw httpError(410, `Share is ${shareRow.status}`);
      }
      if (new Date(shareRow.expires_at).getTime() <= Date.now()) {
        throw httpError(410, "Share has expired");
      }

      // Check if already imported
      const existing = await pool.query(
        `SELECT id FROM user_projects WHERE user_id = $1 AND share_id = $2`,
        [user.id, shareRow.id],
      );
      if (existing.rows[0]) {
        const project = await pool.query(
          `SELECT * FROM user_projects WHERE id = $1`,
          [existing.rows[0].id],
        );
        const row = project.rows[0];
        res.json({
          id: row.id,
          name: row.name,
          description: row.description,
          fileCount: row.file_count,
          totalSize: Number(row.total_size),
          createdAt: row.created_at.toISOString(),
          updatedAt: row.updated_at.toISOString(),
        });
        return;
      }

      // Download the package from S3
      const downloadUrl = await signedDownloadUrl(shareRow.object_key);
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw httpError(502, "Failed to download share package");
      }
      const arrayBuffer = await response.arrayBuffer();
      const raw = Buffer.from(arrayBuffer);

      // Extract files from the package
      const files = await extractPackage(raw);

      // Create project
      const projectId = randomUUID();
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const fileCount = files.filter((f) => f.fileType === "file").length;

      await pool.query(
        `INSERT INTO user_projects
           (id, user_id, share_id, name, description, file_count, total_size)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          projectId,
          user.id,
          shareRow.id,
          shareRow.project_name,
          null,
          fileCount,
          totalSize,
        ],
      );

      // Insert files in a transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const file of files) {
          await client.query(
            `INSERT INTO project_files
               (project_id, path, name, extension, content, size, file_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (project_id, path) DO UPDATE
               SET content = EXCLUDED.content,
                   size = EXCLUDED.size,
                   updated_at = now()`,
            [
              projectId,
              file.path,
              file.name,
              file.extension,
              file.content,
              file.size,
              file.fileType,
            ],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      res.status(201).json({
        id: projectId,
        name: shareRow.project_name,
        description: null,
        fileCount,
        totalSize,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /v1/projects/:id — delete a project
  app.delete("/v1/projects/:id", async (req, res, next) => {
    try {
      const user = await requireAuth(req);
      const projectId = req.params.id;

      const result = await pool.query(
        `DELETE FROM user_projects WHERE id = $1 AND user_id = $2 RETURNING id`,
        [projectId, user.id],
      );
      if (!result.rows[0]) {
        throw httpError(404, "Project not found");
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
