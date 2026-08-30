// FILE: engine-afterpack-hook.cjs
// Purpose: electron-builder afterPack hook that injects the Flutter engine's
// co-located node_modules into the packaged resources/engine directory.
// Layer: Release/build hook
//
// electron-builder prunes node_modules out of `extraResources` while packing,
// so the engine (a plain-`node` child that cannot read app.asar) would lack its
// runtime deps if we relied on extraResources alone. This hook runs after the
// app is unpacked into appOutDir but BEFORE the distributable (AppImage/dmg/
// nsis) is produced, copying the staged payload's node_modules into the correct
// resources/engine location for each platform:
//   linux → <appOutDir>/resources/engine
//   mac   → <appOutDir>/<Product>.app/Contents/Resources/engine
//
// The payload dir is passed through CAIDE_ENGINE_PAYLOAD_DIR (an absolute path
// outside the app dir; extraResources already copies dist/drizzle there under
// `to: "engine"`, electron-builder just strips node_modules — this restores it).

const fs = require("node:fs");
const path = require("node:path");

async function copyDir(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Engine payload node_modules missing at ${source}`);
  }
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    const from = path.join(source, entry);
    const to = path.join(target, entry);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

/**
 * @param {import("@electron-builder/packager").PackContext} _context
 */
exports.default = async function afterPack(context) {
  const payloadNodeModules = process.env.CAIDE_ENGINE_PAYLOAD_DIR
    ? path.join(process.env.CAIDE_ENGINE_PAYLOAD_DIR, "node_modules")
    : null;
  if (!payloadNodeModules || !fs.existsSync(payloadNodeModules)) {
    // Non-engine build or integrated pure harness runtime; nothing to inject.
    return;
  }

  const appOutDir = context.appOutDir;
  const candidates = [];
  // Linux/Windows unpacked: resources directly under appOutDir.
  candidates.push(path.join(appOutDir, "resources", "engine"));
  // macOS bundle: resources under the .app/Contents tree.
  if (fs.existsSync(appOutDir)) {
    for (const entry of fs.readdirSync(appOutDir)) {
      const candidate = path.join(appOutDir, entry, "Contents", "Resources", "engine");
      if (entry.endsWith(".app") && fs.existsSync(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  for (const engineDir of candidates) {
    if (!fs.existsSync(engineDir)) {
      continue;
    }
    await copyDir(payloadNodeModules, path.join(engineDir, "node_modules"));
    console.log(`[engine-afterpack] Injected engine node_modules into ${engineDir}`);
  }
};
