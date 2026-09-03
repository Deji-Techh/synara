import "dotenv/config";
import crypto from "node:crypto";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { Pool } from "pg";
import { z } from "zod";
import {
  installTunnelRelay,
  installTunnelRoutes,
  startTunnelSweep,
  tunnelFallbackMiddleware,
} from "./relay.js";

const PORT = Number(process.env.PORT ?? 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL?.replace(/\/$/, "");

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!PUBLIC_API_URL) throw new Error("PUBLIC_API_URL is required");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");

const RegisterSchema = z.object({
  deviceId: z.string().min(16).max(200),
  displayName: z.string().min(1).max(80).default("CAIDE user"),
});

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
installTunnelRoutes(app, pool);
app.use(express.json({ limit: "55mb" }));

app.get("/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

app.post("/v1/installations/register", async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body);
    const existing = await pool.query(
      `SELECT id FROM preview_installations WHERE device_id=$1`,
      [input.deviceId],
    );
    if (existing.rows[0]) {
      res.status(409).json({
        error:
          "This CAIDE installation is already registered. Restore its saved credential instead of registering again.",
      });
      return;
    }
    const accessToken = token();
    const result = await pool.query(
      `INSERT INTO preview_installations(device_id,display_name,access_token_hash)
       VALUES($1,$2,$3)
       RETURNING id,plan,max_concurrent_sessions,daily_session_limit`,
      [input.deviceId, input.displayName, hash(accessToken)],
    );
    res.status(201).json({ ...result.rows[0], accessToken });
  } catch (error) {
    next(error);
  }
});

app.use(tunnelFallbackMiddleware(pool));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  res.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
});

const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`CAIDE Preview Control Plane listening on ${PORT}`);
});

installTunnelRelay(httpServer, pool, () => PUBLIC_API_URL!);
startTunnelSweep(pool);
