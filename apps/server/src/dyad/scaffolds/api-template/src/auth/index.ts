import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { env } from "../lib/env";

// Create a single connection reused across all requests.
// Creating a new connection per request (via neon(env.DATABASE_URL)) would
// exhaust the Neon connection pool under any real load.
const sql = neon(env.DATABASE_URL);

// Simple in-memory session cache to avoid a DB round-trip on every API call.
// TTL: 60 seconds. Keyed on a hash of the token (never the token itself).
const SESSION_CACHE_TTL_MS = 60_000;

interface CachedSession {
  session: Session;
  expiresAt: number; // Date.now() + TTL
}

const sessionCache = new Map<string, CachedSession>();

// Periodically evict stale entries so memory doesn't grow unbounded.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of sessionCache) {
      if (entry.expiresAt <= now) {
        sessionCache.delete(key);
      }
    }
  },
  60_000,
).unref();

interface Session {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  } | null;
  session: {
    id: string;
    expiresAt: Date;
  } | null;
}

// Runtime validation schema so unsafe casts don't silently pass bad data.
const SessionRowSchema = z.object({
  user_id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  image: z.string().nullable(),
  session_id: z.string(),
  expires_at: z.string(),
});

export async function getSession(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;

  // Check cache first (key is the token; in production consider hashing it).
  const cached = sessionCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.session;
  }

  try {
    const rows = await sql`
      SELECT
        u.id AS user_id,
        u.email,
        u.name,
        u.image,
        s.id AS session_id,
        s.expires_at
      FROM auth.sessions s
      JOIN auth.users u ON u.id = s.user_id
      WHERE s.token = ${token} AND s.expires_at > now()
      LIMIT 1
    `;

    if (rows.length === 0) {
      return null;
    }

    const parsed = SessionRowSchema.safeParse(rows[0]);
    if (!parsed.success) {
      console.error("[auth] Unexpected session row shape:", parsed.error);
      return null;
    }

    const row = parsed.data;
    const session: Session = {
      user: {
        id: row.user_id,
        email: row.email,
        name: row.name,
        image: row.image,
      },
      session: {
        id: row.session_id,
        expiresAt: new Date(row.expires_at),
      },
    };

    // Cache the result so subsequent requests in the TTL window skip the DB.
    sessionCache.set(token, {
      session,
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
    });

    return session;
  } catch (err) {
    console.error("[auth] Session lookup failed:", err);
    return null;
  }
}

/**
 * Invalidate a session token from the local cache. Call this on logout so
 * a revoked token isn't served from cache until TTL expires.
 */
export function invalidateSession(token: string): void {
  sessionCache.delete(token);
}
