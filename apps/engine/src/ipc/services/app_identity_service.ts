import { nativeImage } from "electron";
import log from "electron-log";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { apps } from "@/db/schema";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { getCaideAppPath } from "@/paths/paths";
import {
  AppIdentitySchema,
  type AppIdentity,
  type EditableAppIdentity,
  parseStoredAppIdentity,
} from "@/shared/app_identity";

const logger = log.scope("app_identity_service");
const MANAGED_LOGO_PATH = "public/caide-app-icon.png";
const MANAGED_WEB_LOGO_PATHS = [
  MANAGED_LOGO_PATH,
  "public/caide-icon-192.png",
  "public/caide-icon-512.png",
] as const;
const ANDROID_ICON_DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"] as const;
const IOS_ICON_SIZES = [40, 60, 58, 87, 80, 120, 180, 1024] as const;
const MAX_DECODED_LOGO_BYTES = 12 * 1024 * 1024;
const MIN_LOGO_DIMENSION = 512;

type SyncResult = {
  identity: AppIdentity;
  warnings: string[];
};

async function atomicWrite(filePath: string, content: string | Buffer) {
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function replaceJsStringProperty(
  source: string,
  property: string,
  value: string,
): { source: string; changed: boolean } {
  const pattern = new RegExp(`(\\b${property}\\s*:\\s*)(["'\`])(?:\\\\.|(?!\\2).)*\\2`);
  if (!pattern.test(source)) return { source, changed: false };
  return {
    source: source.replace(pattern, `$1${JSON.stringify(value)}`),
    changed: true,
  };
}

async function synchronizeCapacitorConfig(
  appPath: string,
  identity: AppIdentity,
  warnings: string[],
) {
  const configNames = ["capacitor.config.ts", "capacitor.config.js", "capacitor.config.json"];
  for (const configName of configNames) {
    const configPath = path.join(appPath, configName);
    if (!(await fileExists(configPath))) continue;
    const source = await fs.readFile(configPath, "utf8");
    if (configName.endsWith(".json")) {
      try {
        const config = JSON.parse(source) as Record<string, unknown>;
        config.appId = identity.applicationId;
        config.appName = identity.displayName;
        await atomicWrite(configPath, `${JSON.stringify(config, null, 2)}\n`);
      } catch {
        warnings.push(`${configName} is not valid JSON and was not updated.`);
      }
      return;
    }
    const appId = replaceJsStringProperty(source, "appId", identity.applicationId);
    const appName = replaceJsStringProperty(appId.source, "appName", identity.displayName);
    if (!appId.changed || !appName.changed) {
      warnings.push(`${configName} uses an unsupported shape; CAIDE left it unchanged.`);
      return;
    }
    await atomicWrite(configPath, appName.source);
    return;
  }
}

async function synchronizeWebMetadata(appPath: string, identity: AppIdentity, warnings: string[]) {
  const indexPath = path.join(appPath, "index.html");
  if (await fileExists(indexPath)) {
    const source = await fs.readFile(indexPath, "utf8");
    const title = `<title>${escapeXml(identity.displayName)}</title>`;
    const next = /<title>[\s\S]*?<\/title>/i.test(source)
      ? source.replace(/<title>[\s\S]*?<\/title>/i, title)
      : source.replace(/<\/head>/i, `  ${title}\n</head>`);
    if (next !== source) await atomicWrite(indexPath, next);
  }

  for (const relativePath of ["public/manifest.json", "public/manifest.webmanifest"]) {
    const manifestPath = path.join(appPath, relativePath);
    if (!(await fileExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<
        string,
        unknown
      >;
      manifest.name = identity.displayName;
      manifest.short_name = identity.shortName;
      manifest.description = identity.description;
      manifest.theme_color = identity.primaryColor;
      manifest.background_color = identity.primaryColor;
      manifest.icons = [
        {
          src: "/caide-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/caide-icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ];
      await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    } catch {
      warnings.push(`${relativePath} is invalid and was not updated.`);
    }
  }
}

async function synchronizeAndroidMetadata(appPath: string, identity: AppIdentity) {
  const label = identity.androidLabel ?? identity.displayName;
  const applicationId = identity.androidApplicationId ?? identity.applicationId;
  const stringsPath = path.join(appPath, "android/app/src/main/res/values/strings.xml");
  if (await fileExists(stringsPath)) {
    const source = await fs.readFile(stringsPath, "utf8");
    const appName = `<string name="app_name">${escapeXml(label)}</string>`;
    const next = /<string\s+name=["']app_name["']>[\s\S]*?<\/string>/i.test(source)
      ? source.replace(/<string\s+name=["']app_name["']>[\s\S]*?<\/string>/i, appName)
      : source.replace(/<\/resources>/i, `  ${appName}\n</resources>`);
    if (next !== source) await atomicWrite(stringsPath, next);
  }

  for (const fileName of ["build.gradle", "build.gradle.kts"]) {
    const gradlePath = path.join(appPath, "android/app", fileName);
    if (!(await fileExists(gradlePath))) continue;
    const source = await fs.readFile(gradlePath, "utf8");
    const next = source
      .replace(/(\bapplicationId\s*(?:=\s*)?)["'][^"']+["']/, `$1"${applicationId}"`)
      .replace(/(\bnamespace\s*(?:=\s*)?)["'][^"']+["']/, `$1"${applicationId}"`)
      .replace(/(\bversionName\s*(?:=\s*)?)["'][^"']+["']/, `$1"${identity.versionName}"`)
      .replace(/(\bversionCode\s*(?:=\s*)?)\d+/, `$1${identity.versionCode}`);
    if (next !== source) await atomicWrite(gradlePath, next);
    break;
  }
}

async function synchronizeIosMetadata(appPath: string, identity: AppIdentity) {
  const projectPath = path.join(appPath, "ios/App/App.xcodeproj/project.pbxproj");
  if (!(await fileExists(projectPath))) return;
  const source = await fs.readFile(projectPath, "utf8");
  const bundleId = identity.iosBundleId ?? identity.applicationId;
  const displayName = identity.iosDisplayName ?? identity.displayName;
  const next = source
    .replace(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`)
    .replace(
      /INFOPLIST_KEY_CFBundleDisplayName\s*=\s*[^;]+;/g,
      `INFOPLIST_KEY_CFBundleDisplayName = "${displayName.replaceAll('"', '\\"')}";`,
    )
    .replace(/MARKETING_VERSION\s*=\s*[^;]+;/g, `MARKETING_VERSION = ${identity.versionName};`)
    .replace(
      /CURRENT_PROJECT_VERSION\s*=\s*[^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${identity.versionCode};`,
    );
  if (next !== source) await atomicWrite(projectPath, next);
}

function decodedLogo(dataUrl: string) {
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) {
    throw new CaideError("Choose a PNG, JPEG, or WebP logo.", CaideErrorKind.Validation);
  }
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (Buffer.byteLength(encoded, "base64") > MAX_DECODED_LOGO_BYTES) {
    throw new CaideError(
      "The logo is too large. Choose an image under 12 MB.",
      CaideErrorKind.Validation,
    );
  }
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) {
    throw new CaideError("CAIDE could not decode that logo.", CaideErrorKind.Validation);
  }
  const size = image.getSize();
  if (
    size.width < MIN_LOGO_DIMENSION ||
    size.height < MIN_LOGO_DIMENSION ||
    Math.abs(size.width - size.height) > Math.max(size.width, size.height) * 0.02
  ) {
    throw new CaideError("Use a square logo at least 512 × 512 pixels.", CaideErrorKind.Validation);
  }
  return image;
}

async function writePng(appPath: string, relativePath: string, png: Buffer) {
  await atomicWrite(path.join(appPath, relativePath), png);
}

async function generateLogoAssets(appPath: string, dataUrl: string): Promise<string> {
  const image = decodedLogo(dataUrl);
  const pngAt = (size: number) =>
    image.resize({ width: size, height: size, quality: "best" }).toPNG();

  await Promise.all([
    writePng(appPath, MANAGED_LOGO_PATH, pngAt(1024)),
    writePng(appPath, "public/caide-icon-192.png", pngAt(192)),
    writePng(appPath, "public/caide-icon-512.png", pngAt(512)),
  ]);

  const androidSizes: Array<[string, number]> = [
    ["mdpi", 48],
    ["hdpi", 72],
    ["xhdpi", 96],
    ["xxhdpi", 144],
    ["xxxhdpi", 192],
  ];
  if (await fileExists(path.join(appPath, "android/app/src/main/res"))) {
    await Promise.all(
      androidSizes.flatMap(([density, size]) => [
        writePng(
          appPath,
          `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
          pngAt(size),
        ),
        writePng(
          appPath,
          `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
          pngAt(size),
        ),
      ]),
    );
  }

  const iosIconRoot = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
  if (await fileExists(path.join(appPath, "ios/App/App/Assets.xcassets"))) {
    const iosIcons = [
      { idiom: "iphone", size: "20x20", scale: "2x", px: 40 },
      { idiom: "iphone", size: "20x20", scale: "3x", px: 60 },
      { idiom: "iphone", size: "29x29", scale: "2x", px: 58 },
      { idiom: "iphone", size: "29x29", scale: "3x", px: 87 },
      { idiom: "iphone", size: "40x40", scale: "2x", px: 80 },
      { idiom: "iphone", size: "40x40", scale: "3x", px: 120 },
      { idiom: "iphone", size: "60x60", scale: "2x", px: 120 },
      { idiom: "iphone", size: "60x60", scale: "3x", px: 180 },
      { idiom: "ios-marketing", size: "1024x1024", scale: "1x", px: 1024 },
    ];
    await Promise.all(
      iosIcons.map((entry) =>
        writePng(appPath, `${iosIconRoot}/AppIcon-${entry.px}.png`, pngAt(entry.px)),
      ),
    );
    await atomicWrite(
      path.join(appPath, iosIconRoot, "Contents.json"),
      `${JSON.stringify(
        {
          images: iosIcons.map(({ px, ...entry }) => ({
            ...entry,
            filename: `AppIcon-${px}.png`,
          })),
          info: { author: "caide", version: 1 },
        },
        null,
        2,
      )}\n`,
    );
  }
  return MANAGED_LOGO_PATH;
}

async function removeManagedLogoAssets(appPath: string) {
  const managedPaths = [
    ...MANAGED_WEB_LOGO_PATHS,
    ...ANDROID_ICON_DENSITIES.flatMap((density) => [
      `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
      `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
    ]),
    ...IOS_ICON_SIZES.map(
      (size) => `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-${size}.png`,
    ),
  ];
  await Promise.all(
    managedPaths.map((relativePath) => fs.rm(path.join(appPath, relativePath), { force: true })),
  );
}

async function synchronizeKnownProjectFiles(
  appPath: string,
  identity: AppIdentity,
): Promise<string[]> {
  const warnings: string[] = [];
  await synchronizeCapacitorConfig(appPath, identity, warnings);
  await synchronizeWebMetadata(appPath, identity, warnings);
  await synchronizeAndroidMetadata(appPath, identity);
  await synchronizeIosMetadata(appPath, identity);
  return warnings;
}

async function appRecord(appId: number) {
  const record = await db.query.apps.findFirst({
    where: eq(apps.id, appId),
  });
  if (!record) {
    throw new CaideError("App not found", CaideErrorKind.NotFound);
  }
  return record;
}

export async function getAppIdentity(appId: number): Promise<AppIdentity> {
  const record = await appRecord(appId);
  return parseStoredAppIdentity(record.appIdentity, record.name);
}

export async function updateAppIdentity(input: {
  appId: number;
  identity: EditableAppIdentity;
  logoDataUrl?: string;
  removeLogo?: boolean;
}): Promise<SyncResult> {
  const record = await appRecord(input.appId);
  const previous = parseStoredAppIdentity(record.appIdentity, record.name);
  const appPath = getCaideAppPath(record.path);
  let logoPath = input.removeLogo ? null : previous.logoPath;
  let logoUpdatedAt = input.removeLogo ? null : previous.logoUpdatedAt;

  if (input.logoDataUrl) {
    logoPath = await generateLogoAssets(appPath, input.logoDataUrl);
    logoUpdatedAt = new Date().toISOString();
  } else if (input.removeLogo && previous.logoPath) {
    await removeManagedLogoAssets(appPath);
  }

  const identity = AppIdentitySchema.parse({
    ...input.identity,
    version: 1,
    logoPath,
    logoUpdatedAt,
  });
  const warnings = await synchronizeKnownProjectFiles(appPath, identity);
  await db
    .update(apps)
    .set({
      name: identity.displayName,
      appIdentity: identity,
      updatedAt: new Date(),
    })
    .where(eq(apps.id, input.appId));
  logger.info(`Updated App Identity for project ${input.appId}`);
  return { identity, warnings };
}

export async function synchronizeAppIdentity(appId: number): Promise<SyncResult> {
  const record = await appRecord(appId);
  const identity = parseStoredAppIdentity(record.appIdentity, record.name);
  const appPath = getCaideAppPath(record.path);
  const warnings = await synchronizeKnownProjectFiles(appPath, identity);
  if (identity.logoPath) {
    const sourcePath = path.join(appPath, identity.logoPath);
    if (await fileExists(sourcePath)) {
      const sourceDataUrl = `data:image/png;base64,${(await fs.readFile(sourcePath)).toString(
        "base64",
      )}`;
      await generateLogoAssets(appPath, sourceDataUrl);
    } else {
      warnings.push("The managed logo file is missing.");
    }
  }
  return { identity, warnings };
}
