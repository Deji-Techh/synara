import { z } from "zod";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const REVERSE_DOMAIN =
  /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){1,}(?:\.[a-z][a-z0-9_]*)*$/;
const DEEP_LINK_SCHEME = /^[a-z][a-z0-9+.-]*$/;
const VERSION_NAME = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export const AppIdentitySchema = z.object({
  version: z.literal(1),
  displayName: z.string().trim().min(1).max(80),
  shortName: z.string().trim().min(1).max(30),
  description: z.string().trim().max(500),
  primaryColor: z.string().regex(HEX_COLOR),
  accentColor: z.string().regex(HEX_COLOR),
  applicationId: z.string().trim().max(160).regex(REVERSE_DOMAIN),
  iosBundleId: z.string().trim().max(160).regex(REVERSE_DOMAIN).nullable(),
  androidApplicationId: z
    .string()
    .trim()
    .max(160)
    .regex(REVERSE_DOMAIN)
    .nullable(),
  iosDisplayName: z.string().trim().min(1).max(80).nullable(),
  androidLabel: z.string().trim().min(1).max(80).nullable(),
  versionName: z.string().trim().max(64).regex(VERSION_NAME),
  versionCode: z.number().int().positive().max(2_100_000_000),
  deepLinkScheme: z.string().trim().max(64).regex(DEEP_LINK_SCHEME).nullable(),
  logoPath: z.string().max(260).nullable(),
  logoUpdatedAt: z.string().datetime().nullable(),
});

export const EditableAppIdentitySchema = AppIdentitySchema.omit({
  version: true,
  logoPath: true,
  logoUpdatedAt: true,
});

export type AppIdentity = z.infer<typeof AppIdentitySchema>;
export type EditableAppIdentity = z.infer<typeof EditableAppIdentitySchema>;

export function appIdentitySlug(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return slug || "app";
}

export function defaultAppIdentity(appName: string): AppIdentity {
  const displayName = appName.trim() || "My App";
  const slug = appIdentitySlug(displayName);
  return {
    version: 1,
    displayName,
    shortName: displayName.slice(0, 30),
    description: "",
    primaryColor: "#111111",
    accentColor: "#2563eb",
    applicationId: `com.caide.${slug}`,
    iosBundleId: null,
    androidApplicationId: null,
    iosDisplayName: null,
    androidLabel: null,
    versionName: "1.0.0",
    versionCode: 1,
    deepLinkScheme: slug,
    logoPath: null,
    logoUpdatedAt: null,
  };
}

export function parseStoredAppIdentity(
  value: unknown,
  appName: string,
): AppIdentity {
  const parsed = AppIdentitySchema.safeParse(value);
  return parsed.success ? parsed.data : defaultAppIdentity(appName);
}

export function buildAppIdentityPrompt(identity: AppIdentity): string {
  return `# App Identity (authoritative project metadata)

- Display name: ${identity.displayName}
- Short name: ${identity.shortName}
- Description: ${identity.description || "(not set)"}
- Primary color: ${identity.primaryColor}
- Accent color: ${identity.accentColor}
- Shared application ID: ${identity.applicationId}
- iOS bundle ID: ${identity.iosBundleId ?? identity.applicationId}
- Android application ID: ${identity.androidApplicationId ?? identity.applicationId}
- iOS display name: ${identity.iosDisplayName ?? identity.displayName}
- Android label: ${identity.androidLabel ?? identity.displayName}
- Version: ${identity.versionName} (${identity.versionCode})
- Deep-link scheme: ${identity.deepLinkScheme ?? "(not set)"}
- Managed app logo: ${identity.logoPath ?? "(not set)"}

Treat these values as authoritative whenever you create or modify app manifests, native configuration, titles, branding, icons, splash screens, or release settings. When a managed app logo is present, use it as the product logo and do not replace it with a placeholder.`;
}
