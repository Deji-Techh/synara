import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { Resend } from "resend";
import { z } from "zod";
import { config } from "./config.js";
import { pool } from "./db.js";
import { bearerToken, createToken, hashToken, tokenMatches } from "./security.js";

const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 15;

const MagicLinkSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(80).optional(),
});

const VerifySchema = z.object({
  token: z.string().min(1),
});

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

async function authenticateSession(
  req: { header(name: string): string | undefined },
): Promise<{ id: string; email: string; name: string | null } | null> {
  const token = bearerToken(req.header("authorization"));
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.email, u.name
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export { authenticateSession };

export function registerAuthRoutes(app: Express): void {
  // POST /v1/auth/magic-link — request a magic link
  app.post("/v1/auth/magic-link", async (req, res, next) => {
    try {
      const input = MagicLinkSchema.parse(req.body);
      const token = createToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + MAGIC_LINK_MINUTES * 60_000);

      // Upsert user
      const userResult = await pool.query(
        `INSERT INTO users (email, name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE
           SET name = COALESCE(EXCLUDED.name, users.name),
               last_seen_at = now()
         RETURNING id, email, name`,
        [input.email, input.name ?? null],
      );
      const user = userResult.rows[0];

      // Create auth token
      await pool.query(
        `INSERT INTO auth_tokens (user_id, email, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, input.email, tokenHash, expiresAt],
      );

      // Send email via Resend if API key is configured
      if (config.RESEND_API_KEY) {
        try {
          const resend = new Resend(config.RESEND_API_KEY);
          const deepLinkUrl = `${config.APP_DEEP_LINK_SCHEME}://auth?token=${token}`;
          await resend.emails.send({
            from: config.RESEND_FROM_EMAIL,
            to: input.email,
            subject: "Sign in to C-Mobile",
            html: `
              <html>
              <head><meta charset="utf-8"></head>
              <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                <div style="max-width:480px;margin:0 auto;padding:48px 24px;">
                  <div style="margin-bottom:32px;">
                    <span style="font-size:11px;letter-spacing:1.5px;color:#666;font-weight:600;">CAIDE</span>
                  </div>
                  <h1 style="font-size:20px;font-weight:600;color:#fff;margin:0 0 16px;">Sign in to C-Mobile</h1>
                  <p style="font-size:14px;color:#888;margin:0 0 32px;line-height:1.5;">
                    Click the button below to sign in. This link expires in 15 minutes.
                  </p>
                  <a href="${deepLinkUrl}" style="display:inline-block;padding:12px 32px;background:#fff;color:#000;text-decoration:none;font-size:14px;font-weight:600;border-radius:12px;">
                    Sign in to C-Mobile
                  </a>
                  <p style="font-size:12px;color:#555;margin:32px 0 0;line-height:1.5;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                </div>
              </body>
              </html>
            `,
            text: `Sign in to C-Mobile\n\nClick this link to sign in (expires in 15 minutes):\n${deepLinkUrl}\n\nIf you didn't request this, ignore this email.`,
          });
          console.log(`[auth] Magic link email sent to ${input.email}`);
        } catch (err) {
          console.error(`[auth] Failed to send email to ${input.email}:`, err);
        }
      }

      // In dev mode, also log the token to console for easy testing
      if (process.env.NODE_ENV !== "production") {
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  MAGIC LINK TOKEN (dev mode):`);
        console.log(`  Email: ${input.email}`);
        console.log(`  Token: ${token}`);
        console.log(`  Expires: ${expiresAt.toISOString()}`);
        console.log(`═══════════════════════════════════════════\n`);
      }

      res.json({
        message: "Magic link sent! Check your email.",
        // Dev-only: include token for testing without email
        ...(process.env.NODE_ENV !== "production" && { token }),
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /v1/auth/verify — verify a magic link token and create session
  app.post("/v1/auth/verify", async (req, res, next) => {
    try {
      const input = VerifySchema.parse(req.body);
      const tokenHash = hashToken(input.token);

      // Find the auth token
      const tokenResult = await pool.query(
        `SELECT * FROM auth_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      const authToken = tokenResult.rows[0];

      if (!authToken) {
        throw httpError(401, "Invalid or expired token");
      }
      if (authToken.used_at) {
        throw httpError(401, "Token has already been used");
      }
      if (new Date(authToken.expires_at).getTime() <= Date.now()) {
        throw httpError(401, "Token has expired");
      }

      // Mark token as used
      await pool.query(
        `UPDATE auth_tokens SET used_at = now() WHERE id = $1`,
        [authToken.id],
      );

      // Upsert user (in case of race condition with magic-link route)
      const userResult = await pool.query(
        `INSERT INTO users (email)
         VALUES ($1)
         ON CONFLICT (email) DO UPDATE
           SET last_seen_at = now()
         RETURNING id, email, name, created_at`,
        [authToken.email],
      );
      const user = userResult.rows[0];

      // Create session
      const sessionToken = createToken();
      const sessionExpiry = new Date(Date.now() + SESSION_DAYS * 86_400_000);
      await pool.query(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, hashToken(sessionToken), sessionExpiry],
      );

      // Update last_seen_at
      await pool.query(
        `UPDATE users SET last_seen_at = now() WHERE id = $1`,
        [user.id],
      );

      res.json({
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.created_at.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /v1/auth/me — get current user from session
  app.get("/v1/auth/me", async (req, res, next) => {
    try {
      const user = await authenticateSession(req);
      if (!user) {
        throw httpError(401, "Not authenticated");
      }
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });
}
