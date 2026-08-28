#!/usr/bin/env node
import { fileURLToPath as __cFL } from "node:url";
import * as __cDP from "node:path";
const __filename = __cFL(import.meta.url);
const __dirname = __cDP.dirname(__filename);

import { r as __exportAll } from "./chunk-CeepVFa8.mjs";
import * as path$1 from "path";
import fs from "node:fs";

//#region src/lib/framework_constants.ts
const APP_FRAMEWORK_TYPES = [
	"nextjs",
	"vite",
	"vite-nitro",
	"react-native",
	"flutter",
	"other"
];
const NEXTJS_CONFIG_FILES = [
	"next.config.js",
	"next.config.mjs",
	"next.config.cjs",
	"next.config.ts"
];
const VITE_CONFIG_FILES = [
	"vite.config.js",
	"vite.config.ts",
	"vite.config.mjs",
	"vite.config.cjs",
	"vite.config.mts",
	"vite.config.cts"
];

//#endregion
//#region src/ipc/utils/framework_utils.ts
var framework_utils_exports = /* @__PURE__ */ __exportAll({
	detectFrameworkType: () => detectFrameworkType,
	detectNextJsMajorVersion: () => detectNextJsMajorVersion,
	resolveProjectFrameworkType: () => resolveProjectFrameworkType
});
/**
* Detect the framework type for an app by checking config files and package.json.
*
* Vite apps with a Nitro server layer (added via `enable_nitro`) are reported
* as `"vite-nitro"`. Detection looks for `nitro.config.{ts,js,mjs}` first, then
* falls back to `nitro` in package.json deps — either is sufficient since the
* tool writes the config file and installs the package together.
*/
function detectFrameworkType(appPath) {
	try {
		if (isFlutterApp(appPath)) return "flutter";
		for (const config of NEXTJS_CONFIG_FILES) if (fs.existsSync(path$1.join(appPath, config))) return "nextjs";
		let isVite = false;
		for (const config of VITE_CONFIG_FILES) if (fs.existsSync(path$1.join(appPath, config))) {
			isVite = true;
			break;
		}
		let packageJsonDeps = null;
		const packageJsonPath = path$1.join(appPath, "package.json");
		if (fs.existsSync(packageJsonPath)) {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
			const deps = {
				...packageJson.dependencies,
				...packageJson.devDependencies
			};
			packageJsonDeps = deps;
			if (!isVite && deps.next) return "nextjs";
			if (!isVite && deps.vite) isVite = true;
		}
		if (isVite) return hasNitro(appPath, packageJsonDeps) ? "vite-nitro" : "vite";
		return "other";
	} catch {
		return null;
	}
}
/** Resolve the immutable product framework before falling back to file detection. */
function resolveProjectFrameworkType(framework, appPath) {
	if (framework === "flutter") return "flutter";
	if (framework === "website") return "vite";
	if (framework === "react-native") return "react-native";
	if (framework === "blank") return "other";
	return detectFrameworkType(appPath);
}
function hasNitro(appPath, deps) {
	for (const config of [
		"nitro.config.ts",
		"nitro.config.js",
		"nitro.config.mjs"
	]) if (fs.existsSync(path$1.join(appPath, config))) return true;
	return Boolean(deps?.nitro);
}
/**
* Whether the app is a Flutter app, detected by a `pubspec.yaml` that declares
* the `flutter` SDK dependency (plain Dart packages don't count).
*/
function isFlutterApp(appPath) {
	try {
		const pubspecPath = path$1.join(appPath, "pubspec.yaml");
		if (!fs.existsSync(pubspecPath)) return false;
		return fs.readFileSync(pubspecPath, "utf8").includes("sdk: flutter");
	} catch {
		return false;
	}
}
/**
* Read the Next.js major version from the app's package.json.
* Returns null when next is not installed or the version string is non-numeric
* (e.g. "latest", "canary", a git URL).
*/
function detectNextJsMajorVersion(appPath) {
	try {
		const packageJsonPath = path$1.join(appPath, "package.json");
		if (!fs.existsSync(packageJsonPath)) return null;
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const nextVersion = packageJson.dependencies?.next ?? packageJson.devDependencies?.next;
		if (typeof nextVersion !== "string") return null;
		const match = nextVersion.match(/\d+/);
		if (!match) return null;
		return parseInt(match[0], 10);
	} catch {
		return null;
	}
}

//#endregion
export { APP_FRAMEWORK_TYPES as a, resolveProjectFrameworkType as i, detectNextJsMajorVersion as n, VITE_CONFIG_FILES as o, framework_utils_exports as r, detectFrameworkType as t };