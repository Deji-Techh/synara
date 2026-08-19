import { z } from "zod";
import { ToolDefinition, escapeXmlAttr } from "./types";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { rawAsset } from "@/raw-assets";
const addAuthentication = rawAsset("src/prompts/guides/add-authentication.md");
const addEmailVerification = rawAsset("src/prompts/guides/add-email-verification.md");
const addPasswordReset = rawAsset("src/prompts/guides/add-password-reset.md");
const addSocialAuth = rawAsset("src/prompts/guides/add-social-auth.md");
const addNativeCapability = rawAsset("src/prompts/guides/add-native-capability.md");
const addCommunications = rawAsset("src/prompts/guides/add-communications.md");
const addObservability = rawAsset("src/prompts/guides/add-observability.md");
const addPayments = rawAsset("src/prompts/guides/add-payments.md");
const addRealtimeJobs = rawAsset("src/prompts/guides/add-realtime-jobs.md");
const buildSecureBackend = rawAsset("src/prompts/guides/build-secure-backend.md");
const addStorageMedia = rawAsset("src/prompts/guides/add-storage-media.md");
const productionQuality = rawAsset("src/prompts/guides/production-quality.md");
const productionAuthAuthorization = rawAsset("src/prompts/guides/production-auth-authorization.md");
const productionPlatform = rawAsset("src/prompts/guides/production-platform.md");
const provisionBackend = rawAsset("src/prompts/guides/provision-backend.md");

import { filterGuideByFramework } from "@/prompts/guides/filter_guide_by_framework";

/**
 * Registry of available guides. To add a new guide, import its .md file
 * with ?raw and add an entry here.
 */
const GUIDES: Record<string, string> = {
  "add-authentication": addAuthentication,
  "add-email-verification": addEmailVerification,
  "add-password-reset": addPasswordReset,
  "add-social-auth": addSocialAuth,
  "add-native-capability": addNativeCapability,
  "add-communications": addCommunications,
  "add-observability": addObservability,
  "add-payments": addPayments,
  "add-realtime-jobs": addRealtimeJobs,
  "add-storage-media": addStorageMedia,
  "build-secure-backend": buildSecureBackend,
  "production-quality": productionQuality,
  "production-auth-authorization": productionAuthAuthorization,
  "production-platform": productionPlatform,
  "provision-backend": provisionBackend,
};

export const GUIDE_NAMES = Object.keys(GUIDES).sort();

export function getGuideContent(
  guide: string,
  frameworkType: Parameters<typeof filterGuideByFramework>[1],
) {
  const content = GUIDES[guide];
  if (!content) {
    const available = GUIDE_NAMES.join(", ");
    throw new CaideError(
      `Guide "${guide}" not found. Available guides: ${available}`,
      CaideErrorKind.NotFound,
    );
  }
  const hasFrameworkSections =
    content.includes("<nextjs-only>") || content.includes("<vite-nitro-only>");
  return hasFrameworkSections
    ? filterGuideByFramework(content, frameworkType)
    : content;
}

const readGuideSchema = z.object({
  guide: z
    .string()
    .describe(`Guide name. Available guides: ${GUIDE_NAMES.join(", ")}`),
});

export const readGuideTool: ToolDefinition<z.infer<typeof readGuideSchema>> = {
  name: "read_guide",
  description: `Read a detailed implementation guide before building a matching feature. Available guides: ${GUIDE_NAMES.join(", ")}.`,
  inputSchema: readGuideSchema,
  defaultConsent: "always",

  getConsentPreview: (args) => `Read guide: ${args.guide}`,

  buildXml: (args) => {
    if (!args.guide) return undefined;
    return `<caide-read-guide name="${escapeXmlAttr(args.guide)}"></caide-read-guide>`;
  },

  execute: async (args, ctx) => {
    return getGuideContent(args.guide, ctx.frameworkType);
  },
};
