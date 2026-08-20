import { z } from "zod";
import { defineContract, createClient, defineEvent, createEventClient } from "../contracts/core";

// =============================================================================
// Capacitor Schemas
// =============================================================================

export const AppIdParamsSchema = z.object({
  appId: z.number(),
});

export const NativeHostPlatformSchema = z.enum(["windows", "macos", "linux", "other"]);

export const NativeToolStateSchema = z.enum(["ready", "missing", "optional", "unsupported"]);

export const NativeToolStatusSchema = z.object({
  id: z.enum([
    "node",
    "java",
    "android-sdk",
    "android-platform",
    "android-build-tools",
    "gradle",
    "adb",
    "android-studio",
    "xcode",
    "flutter",
  ]),
  label: z.string(),
  description: z.string(),
  requiredForAndroidBuild: z.boolean(),
  state: NativeToolStateSchema,
  version: z.string().nullable(),
  location: z.string().nullable(),
  remediation: z.string().nullable(),
});

export const ManagedToolchainStatusSchema = z.object({
  supported: z.boolean(),
  installed: z.boolean(),
  root: z.string(),
  androidSdkPath: z.string(),
  jdkHome: z.string(),
  licenseUrl: z.string(),
  estimatedDownloadBytes: z.number().nonnegative(),
  jdkInstalled: z.boolean(),
  commandLineToolsInstalled: z.boolean(),
  sdkPackagesInstalled: z.boolean(),
  requiredPackages: z.array(z.string()),
  compileSdk: z.number().int().positive(),
  buildToolsVersion: z.string(),
  unsupportedReason: z.string().nullable(),
});

export const NativeAppInfoSchema = z.object({
  name: z.string(),
  packageId: z.string().nullable(),
  versionName: z.string().nullable(),
  versionCode: z.number().int().positive().nullable(),
  webDir: z.string().nullable(),
});

export const NativeArtifactKindSchema = z.enum(["debug-apk", "release-apk", "release-aab", "ipa"]);

export const NativeArtifactSchema = z.object({
  path: z.string(),
  fileName: z.string(),
  kind: NativeArtifactKindSchema,
  sizeBytes: z.number().nonnegative(),
  createdAt: z.string(),
  sha256: z.string().nullable(),
  signed: z.boolean(),
  installable: z.boolean(),
});

export const NativeReleaseStatusSchema = z.object({
  hostPlatform: NativeHostPlatformSchema,
  platformKind: z.enum(["capacitor", "flutter"]).default("capacitor"),
  capacitorInstalled: z.boolean(),
  androidProjectExists: z.boolean(),
  iosProjectExists: z.boolean(),
  canBuildAndroid: z.boolean(),
  canOpenAndroidStudio: z.boolean(),
  canOpenXcode: z.boolean(),
  app: NativeAppInfoSchema,
  tools: z.array(NativeToolStatusSchema),
  artifacts: z.array(NativeArtifactSchema),
  managedToolchain: ManagedToolchainStatusSchema.optional(),
});

export const AndroidSigningCredentialsSchema = z.object({
  keystorePath: z.string().min(1),
  keyAlias: z.string().min(1),
  storePassword: z.string().min(1),
  keyPassword: z.string().min(1),
});

export const AndroidBuildTargetSchema = z.enum(["debug-apk", "release-apk", "release-aab"]);

export const BuildAndroidArtifactParamsSchema = AppIdParamsSchema.extend({
  target: AndroidBuildTargetSchema,
  signing: AndroidSigningCredentialsSchema.nullable(),
  remoteApiUrl: z.string().optional(),
});

export const CreateAndroidKeystoreParamsSchema = AppIdParamsSchema.extend({
  keyAlias: z.string().min(1).max(80),
  storePassword: z.string().min(6),
  keyPassword: z.string().min(6),
  commonName: z.string().min(1).max(120),
  organization: z.string().max(120),
  organizationalUnit: z.string().max(120),
  city: z.string().max(120),
  state: z.string().max(120),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/, "Use a two-letter country code"),
  validityYears: z.number().int().min(25).max(100),
});

export const NativeArtifactParamsSchema = AppIdParamsSchema.extend({
  artifactPath: z.string().min(1),
});

export type NativeToolStatus = z.infer<typeof NativeToolStatusSchema>;
export type ManagedToolchainStatus = z.infer<typeof ManagedToolchainStatusSchema>;
export type NativeAppInfo = z.infer<typeof NativeAppInfoSchema>;
export type NativeArtifact = z.infer<typeof NativeArtifactSchema>;
export type NativeArtifactKind = z.infer<typeof NativeArtifactKindSchema>;
export type NativeReleaseStatus = z.infer<typeof NativeReleaseStatusSchema>;
export type AndroidSigningCredentials = z.infer<typeof AndroidSigningCredentialsSchema>;
export type AndroidBuildTarget = z.infer<typeof AndroidBuildTargetSchema>;
export type CreateAndroidKeystoreParams = z.infer<typeof CreateAndroidKeystoreParamsSchema>;

// =============================================================================
// Capacitor Contracts
// =============================================================================

export const BuildProgressSchema = z.object({
  phase: z.enum(["web-build", "capacitor-sync", "gradle-compile", "signing", "packaging", "done"]),
  percent: z.number().min(0).max(100),
  message: z.string(),
});

export type BuildProgress = z.infer<typeof BuildProgressSchema>;

export const ManagedToolchainProgressSchema = z.object({
  appId: z.number(),
  phase: z.enum([
    "preparing",
    "download-jdk",
    "extract-jdk",
    "download-android-tools",
    "extract-android-tools",
    "licenses",
    "sdk-packages",
    "verifying",
    "done",
  ]),
  percent: z.number().min(0).max(100),
  componentPercent: z.number().min(0).max(100),
  downloadedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative().nullable(),
  message: z.string(),
});

export type ManagedToolchainProgress = z.infer<typeof ManagedToolchainProgressSchema>;

export const BUILD_PROGRESS_CHANNEL = "capacitor-build-progress";
export const MANAGED_TOOLCHAIN_PROGRESS_CHANNEL = "capacitor-managed-toolchain-progress";

export const CancelBuildParamsSchema = AppIdParamsSchema;
export const InstallManagedAndroidToolchainParamsSchema = AppIdParamsSchema.extend({
  acceptAndroidSdkLicense: z.literal(true),
});

export const capacitorContracts = {
  isCapacitor: defineContract({
    channel: "is-capacitor",
    input: AppIdParamsSchema,
    output: z.boolean(),
  }),

  cancelBuild: defineContract({
    channel: "cancel-build",
    input: CancelBuildParamsSchema,
    output: z.void(),
  }),

  installManagedAndroidToolchain: defineContract({
    channel: "install-managed-android-toolchain",
    input: InstallManagedAndroidToolchainParamsSchema,
    output: NativeReleaseStatusSchema,
  }),

  cancelManagedToolchainInstall: defineContract({
    channel: "cancel-managed-toolchain-install",
    input: AppIdParamsSchema,
    output: z.void(),
  }),

  getNativeReleaseStatus: defineContract({
    channel: "get-native-release-status",
    input: AppIdParamsSchema,
    output: NativeReleaseStatusSchema,
  }),

  syncCapacitor: defineContract({
    channel: "sync-capacitor",
    input: AppIdParamsSchema.extend({ remoteApiUrl: z.string().optional() }),
    output: z.void(),
  }),

  buildAndroidArtifact: defineContract({
    channel: "build-android-artifact",
    input: BuildAndroidArtifactParamsSchema,
    output: NativeArtifactSchema,
  }),

  buildIosArtifact: defineContract({
    channel: "build-ios-artifact",
    input: AppIdParamsSchema,
    output: NativeArtifactSchema,
  }),

  selectAndroidKeystore: defineContract({
    channel: "select-android-keystore",
    input: AppIdParamsSchema,
    output: z.string().nullable(),
  }),

  createAndroidKeystore: defineContract({
    channel: "create-android-keystore",
    input: CreateAndroidKeystoreParamsSchema,
    output: z.string().nullable(),
  }),

  exportNativeArtifact: defineContract({
    channel: "export-native-artifact",
    input: NativeArtifactParamsSchema,
    output: z.string().nullable(),
  }),

  revealNativeArtifact: defineContract({
    channel: "reveal-native-artifact",
    input: NativeArtifactParamsSchema,
    output: z.void(),
  }),

  installAndroidArtifact: defineContract({
    channel: "install-android-artifact",
    input: NativeArtifactParamsSchema,
    output: z.void(),
  }),

  openIos: defineContract({
    channel: "open-ios",
    input: AppIdParamsSchema,
    output: z.void(),
  }),

  openAndroid: defineContract({
    channel: "open-android",
    input: AppIdParamsSchema,
    output: z.void(),
  }),
} as const;

// =============================================================================
// Capacitor Event Contracts
// =============================================================================

export const capacitorEvents = {
  buildProgress: defineEvent({
    channel: BUILD_PROGRESS_CHANNEL,
    payload: BuildProgressSchema,
  }),
  managedToolchainProgress: defineEvent({
    channel: MANAGED_TOOLCHAIN_PROGRESS_CHANNEL,
    payload: ManagedToolchainProgressSchema,
  }),
} as const;

export const capacitorEventClient = createEventClient(capacitorEvents);

// =============================================================================
// Capacitor Client
// =============================================================================

export const capacitorClient = createClient(capacitorContracts);
