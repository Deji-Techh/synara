import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEON_AUTH_SECRET: z.string().min(32),
  NEON_AUTH_URL: z.string().url().default("http://localhost:3001"),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // CORS_ORIGINS is a comma-separated list of allowed origins.
  // Each origin must be a valid URL to prevent misconfiguration.
  // Example: "http://localhost:5173,https://myapp.vercel.app"
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((s) =>
      s
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          z.string().refine(
            (origin) => {
              try {
                const url = new URL(origin);
                return url.protocol === "http:" || url.protocol === "https:";
              } catch {
                return false;
              }
            },
            { message: "Each CORS origin must be a valid http/https URL" },
          ),
        )
        .min(1, "At least one CORS origin is required"),
    ),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.flatten());
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
