#!/usr/bin/env node
import { fileURLToPath as __cFL } from "node:url";
import * as __cDP from "node:path";
const __filename = __cFL(import.meta.url);
const __dirname = __cDP.dirname(__filename);

import { i as __require, t as __commonJSMin } from "./chunk-CeepVFa8.mjs";

//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/native-loader.js
var require_native_loader = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs$1 = __require("node:fs");
	const path$1 = __require("node:path");
	function packageRoot(fromDir = __dirname) {
		return path$1.basename(fromDir) === "dist" ? path$1.dirname(fromDir) : fromDir;
	}
	const PREBUILT_TARGETS = Object.freeze([
		{
			triple: "x86_64-pc-windows-msvc",
			platform: "win32",
			arch: "x64",
			platformArchABI: "win32-x64-msvc",
			packageName: "@mustardscript/binding-win32-x64-msvc",
			localFile: "index.win32-x64-msvc.node",
			os: ["win32"],
			cpu: ["x64"]
		},
		{
			triple: "x86_64-apple-darwin",
			platform: "darwin",
			arch: "x64",
			platformArchABI: "darwin-x64",
			packageName: "@mustardscript/binding-darwin-x64",
			localFile: "index.darwin-x64.node",
			os: ["darwin"],
			cpu: ["x64"]
		},
		{
			triple: "aarch64-apple-darwin",
			platform: "darwin",
			arch: "arm64",
			platformArchABI: "darwin-arm64",
			packageName: "@mustardscript/binding-darwin-arm64",
			localFile: "index.darwin-arm64.node",
			os: ["darwin"],
			cpu: ["arm64"]
		},
		{
			triple: "x86_64-unknown-linux-gnu",
			platform: "linux",
			arch: "x64",
			platformArchABI: "linux-x64-gnu",
			packageName: "@mustardscript/binding-linux-x64-gnu",
			localFile: "index.linux-x64-gnu.node",
			os: ["linux"],
			cpu: ["x64"],
			libc: ["glibc"]
		}
	]);
	const TARGETS_BY_RUNTIME = new Map(PREBUILT_TARGETS.map((target) => [`${target.platform}:${target.arch}`, target]));
	function isExplicitFilePath(specifier) {
		return path$1.isAbsolute(specifier) || specifier.startsWith(`.${path$1.sep}`) || specifier.startsWith(`..${path$1.sep}`) || specifier.startsWith("./") || specifier.startsWith("../");
	}
	function resolveNativeAddonPath(candidate, label, cwd = process.cwd()) {
		if (typeof candidate !== "string" || candidate.trim() === "") throw new Error(`${label} must be a non-empty file path to a native .node addon`);
		if (!isExplicitFilePath(candidate)) throw new Error(`${label} must be an explicit absolute or relative file path to a native .node addon`);
		const resolved = path$1.resolve(cwd, candidate);
		if (path$1.extname(resolved) !== ".node") throw new Error(`${label} must point to a native .node addon`);
		if (!fs$1.statSync(resolved, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label} does not exist: ${resolved}`);
		return resolved;
	}
	function getCurrentPrebuiltTarget() {
		return TARGETS_BY_RUNTIME.get(`${process.platform}:${process.arch}`) ?? null;
	}
	function getLocalBuildOutputFile() {
		return getCurrentPrebuiltTarget()?.localFile ?? null;
	}
	function validatePrebuiltPackageManifest(manifest, target, packageJsonPath) {
		if (manifest?.name !== target.packageName) throw new Error(`optional prebuilt package at ${packageJsonPath} does not match ${target.packageName}`);
		if (manifest?.main !== target.localFile) throw new Error(`optional prebuilt package ${target.packageName} must expose its native addon as ${target.localFile}`);
	}
	function resolvePrebuiltPackage(searchRoot = packageRoot()) {
		const target = getCurrentPrebuiltTarget();
		if (!target) return null;
		let packageJsonPath;
		try {
			packageJsonPath = __require.resolve(`${target.packageName}/package.json`, { paths: [searchRoot] });
		} catch {
			return null;
		}
		const packageRoot = path$1.dirname(packageJsonPath);
		validatePrebuiltPackageManifest(JSON.parse(fs$1.readFileSync(packageJsonPath, "utf8")), target, packageJsonPath);
		const binaryPath = path$1.join(packageRoot, target.localFile);
		if (!fs$1.statSync(binaryPath, { throwIfNoEntry: false })?.isFile()) throw new Error(`optional prebuilt package ${target.packageName} is missing ${target.localFile}`);
		return {
			...target,
			packageJsonPath,
			packageRoot,
			binaryPath
		};
	}
	function localBinaryCandidates(searchRoot = packageRoot()) {
		const roots = [searchRoot, path$1.join(searchRoot, "crates", "mustard-node")];
		const candidates = [];
		for (const root of roots) {
			if (!fs$1.existsSync(root)) continue;
			const localFile = getLocalBuildOutputFile();
			if (!localFile) continue;
			for (const filename of [localFile]) {
				const candidate = path$1.join(root, filename);
				if (fs$1.statSync(candidate, { throwIfNoEntry: false })?.isFile()) candidates.push(candidate);
			}
		}
		return candidates;
	}
	function loadNative(options = {}) {
		const env = options.env ?? process.env;
		const searchRoot = options.searchRoot ?? packageRoot();
		const overrideCwd = options.overrideCwd ?? process.cwd();
		const loadErrors = [];
		const overridePath = env.MUSTARDSCRIPT_NATIVE_LIBRARY_PATH ?? env.MUSTARD_NATIVE_LIBRARY_PATH ?? env.NAPI_RS_NATIVE_LIBRARY_PATH;
		if (overridePath) try {
			return __require(resolveNativeAddonPath(overridePath, "native library override", overrideCwd));
		} catch (error) {
			loadErrors.push(error);
		}
		for (const candidate of localBinaryCandidates(searchRoot)) try {
			return __require(candidate);
		} catch (error) {
			loadErrors.push(error);
		}
		try {
			const prebuilt = resolvePrebuiltPackage(searchRoot);
			if (prebuilt) try {
				return __require(prebuilt.binaryPath);
			} catch (error) {
				loadErrors.push(error);
			}
		} catch (error) {
			loadErrors.push(error);
		}
		const target = getCurrentPrebuiltTarget();
		const platformHint = target ? `${target.platformArchABI} via ${target.packageName}` : `${process.platform}-${process.arch}`;
		throw new AggregateError(loadErrors, `Unable to locate a MustardScript native addon for ${platformHint}. Install a matching prebuilt package for this platform.`);
	}
	module.exports = {
		PREBUILT_TARGETS,
		getCurrentPrebuiltTarget,
		getLocalBuildOutputFile,
		localBinaryCandidates,
		resolveNativeAddonPath,
		resolvePrebuiltPackage,
		loadNative
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/errors.js
var require_errors = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const KNOWN_ERROR_KINDS = new Set([
		"Parse",
		"Validation",
		"Runtime",
		"Limit",
		"Serialization"
	]);
	var MustardError = class extends Error {
		constructor(kind, message, cause) {
			super(message, { cause });
			this.kind = kind;
			this.name = `Mustard${kind}Error`;
		}
	};
	function normalizeNativeError(error) {
		if (!(error instanceof Error)) return error;
		const match = /^([A-Za-z]+):\s([\s\S]+)$/.exec(error.message);
		if (!match) return error;
		const [, kind, message] = match;
		if (!KNOWN_ERROR_KINDS.has(kind)) return error;
		return new MustardError(kind, message, error);
	}
	function callNative(fn, ...args) {
		try {
			return fn(...args);
		} catch (error) {
			throw normalizeNativeError(error);
		}
	}
	module.exports = {
		MustardError,
		callNative,
		normalizeNativeError
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/structured.js
var require_structured = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { types: types$3 } = __require("node:util");
	const HOST_BOUNDARY_MAX_DEPTH = 128;
	const HOST_BOUNDARY_MAX_ARRAY_LENGTH = 1e6;
	const encodedStartOptionsSuffixCache = /* @__PURE__ */ new WeakMap();
	const encodedStartOptionsBinarySuffixCache = /* @__PURE__ */ new WeakMap();
	const BOUNDARY_BINARY_MAGIC = Buffer.from([
		77,
		83,
		66,
		1
	]);
	const BOUNDARY_BINARY_KIND = Object.freeze({
		START_OPTIONS: 1,
		STRUCTURED_INPUTS: 2,
		RESUME_PAYLOAD: 3
	});
	const STRUCTURED_BINARY_TAG = Object.freeze({
		UNDEFINED: 0,
		NULL: 1,
		HOLE: 2,
		BOOL_FALSE: 3,
		BOOL_TRUE: 4,
		STRING: 5,
		NUMBER_FINITE: 6,
		NUMBER_NAN: 7,
		NUMBER_INFINITY: 8,
		NUMBER_NEG_INFINITY: 9,
		NUMBER_NEG_ZERO: 10,
		ARRAY: 11,
		OBJECT: 12
	});
	const RESUME_BINARY_TAG = Object.freeze({
		VALUE: 0,
		ERROR: 1,
		CANCELLED: 2
	});
	const LIMIT_FIELD_LAYOUT = Object.freeze([
		["instruction_budget", 1],
		["heap_limit_bytes", 2],
		["allocation_budget", 4],
		["call_depth_limit", 8],
		["max_outstanding_host_calls", 16]
	]);
	var BinaryWriter = class {
		constructor(initialSize = 256) {
			this._buffer = Buffer.allocUnsafe(initialSize);
			this._offset = 0;
		}
		_ensureCapacity(additionalBytes) {
			const required = this._offset + additionalBytes;
			if (required <= this._buffer.length) return;
			let nextLength = this._buffer.length;
			while (nextLength < required) nextLength *= 2;
			const nextBuffer = Buffer.allocUnsafe(nextLength);
			this._buffer.copy(nextBuffer, 0, 0, this._offset);
			this._buffer = nextBuffer;
		}
		writeHeader(kind) {
			this.writeBuffer(BOUNDARY_BINARY_MAGIC);
			this.writeU8(kind);
		}
		writeBuffer(value) {
			const buffer = Buffer.from(value);
			this._ensureCapacity(buffer.length);
			buffer.copy(this._buffer, this._offset);
			this._offset += buffer.length;
		}
		writeU8(value) {
			this._ensureCapacity(1);
			this._buffer.writeUInt8(value, this._offset);
			this._offset += 1;
		}
		writeU32(value) {
			this._ensureCapacity(4);
			this._buffer.writeUInt32LE(value >>> 0, this._offset);
			this._offset += 4;
		}
		writeF64(value) {
			this._ensureCapacity(8);
			this._buffer.writeDoubleLE(value, this._offset);
			this._offset += 8;
		}
		writeString(value) {
			const byteLength = Buffer.byteLength(value, "utf8");
			this.writeU32(byteLength);
			this._ensureCapacity(byteLength);
			this._buffer.write(value, this._offset, byteLength, "utf8");
			this._offset += byteLength;
		}
		toBuffer() {
			return Buffer.from(this._buffer.subarray(0, this._offset));
		}
	};
	function assertBoundaryDepth(depth, label) {
		if (depth > HOST_BOUNDARY_MAX_DEPTH) throw new TypeError(`${label} nesting limit exceeded`);
	}
	function assertBoundaryArrayLength(length, label) {
		if (length > HOST_BOUNDARY_MAX_ARRAY_LENGTH) throw new TypeError(`${label} arrays longer than ${HOST_BOUNDARY_MAX_ARRAY_LENGTH} elements cannot cross the host boundary`);
	}
	function encodeNumber(value) {
		if (Number.isNaN(value)) return { Number: "NaN" };
		if (Object.is(value, -0)) return { Number: "NegZero" };
		if (value === Infinity) return { Number: "Infinity" };
		if (value === -Infinity) return { Number: "NegInfinity" };
		return { Number: { Finite: value } };
	}
	function isObjectLike(value) {
		return value !== null && (typeof value === "object" || typeof value === "function");
	}
	function assertNotProxy(value) {
		if (isObjectLike(value) && types$3.isProxy(value)) throw new TypeError("Proxy values cannot cross the host boundary");
	}
	function isPlainStructuredObject(value) {
		if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
		assertNotProxy(value);
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	}
	function hasOwnProperty(value, key) {
		return Object.prototype.hasOwnProperty.call(value, key);
	}
	function defineEnumerableProperty(target, key, value) {
		Object.defineProperty(target, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true
		});
	}
	function isAccessorDescriptor(descriptor) {
		return hasOwnProperty(descriptor, "get") || hasOwnProperty(descriptor, "set");
	}
	function enumerateDataProperties(value) {
		assertNotProxy(value);
		const keys = Object.keys(value);
		const entries = new Array(keys.length);
		let entryCount = 0;
		for (const key of keys) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (descriptor === void 0) continue;
			if (isAccessorDescriptor(descriptor)) throw new TypeError("host objects with accessors cannot cross the host boundary");
			entries[entryCount] = [key, descriptor];
			entryCount += 1;
		}
		entries.length = entryCount;
		return entries;
	}
	function enterStructuredTraversal(value, traversal) {
		if (!isObjectLike(value)) return () => {};
		if (traversal.active.has(value)) throw new TypeError("cyclic values cannot cross the host boundary");
		traversal.active.add(value);
		return () => {
			traversal.active.delete(value);
		};
	}
	function encodeStructuredArray(value, traversal, depth) {
		assertNotProxy(value);
		assertBoundaryArrayLength(value.length, "host boundary");
		const leave = enterStructuredTraversal(value, traversal);
		try {
			const entries = new Array(value.length);
			for (let index = 0; index < value.length; index += 1) {
				const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
				if (descriptor === void 0) {
					entries[index] = "Hole";
					continue;
				}
				if (isAccessorDescriptor(descriptor)) throw new TypeError("host objects with accessors cannot cross the host boundary");
				entries[index] = encodeStructured(descriptor.value, traversal, depth + 1);
			}
			return { Array: entries };
		} finally {
			leave();
		}
	}
	function encodeStructuredObject(value, traversal, depth) {
		const leave = enterStructuredTraversal(value, traversal);
		try {
			const object = {};
			for (const [key, descriptor] of enumerateDataProperties(value)) defineEnumerableProperty(object, key, encodeStructured(descriptor.value, traversal, depth + 1));
			return { Object: object };
		} finally {
			leave();
		}
	}
	function encodeStructured(value, traversal = { active: /* @__PURE__ */ new WeakSet() }, depth = 1) {
		assertBoundaryDepth(depth, "host boundary");
		if (value === void 0) return "Undefined";
		if (value === null) return "Null";
		if (typeof value === "boolean") return { Bool: value };
		if (typeof value === "number") return encodeNumber(value);
		if (typeof value === "string") return { String: value };
		if (Array.isArray(value)) return encodeStructuredArray(value, traversal, depth);
		if (typeof value === "object") {
			if (!isPlainStructuredObject(value)) throw new TypeError("Unsupported host value: only plain objects and arrays can cross the host boundary");
			return encodeStructuredObject(value, traversal, depth);
		}
		throw new TypeError("Unsupported host value");
	}
	function decodeStructured(value, depth = 1) {
		assertBoundaryDepth(depth, "structured host boundary");
		if (value === "Undefined") return;
		if (value === "Null") return null;
		if (value !== null && typeof value === "object" && hasOwnProperty(value, "Bool")) return value.Bool;
		if (value !== null && typeof value === "object" && hasOwnProperty(value, "String")) return value.String;
		if (value !== null && typeof value === "object" && hasOwnProperty(value, "Number")) {
			const encoded = value.Number;
			if (encoded === "NaN") return NaN;
			if (encoded === "Infinity") return Infinity;
			if (encoded === "NegInfinity") return -Infinity;
			if (encoded === "NegZero") return -0;
			return encoded.Finite;
		}
		if (value !== null && typeof value === "object" && hasOwnProperty(value, "Array")) {
			assertBoundaryArrayLength(value.Array.length, "structured host boundary");
			const array = new Array(value.Array.length);
			value.Array.forEach((entry, index) => {
				if (entry !== "Hole") array[index] = decodeStructured(entry, depth + 1);
			});
			return array;
		}
		if (value !== null && typeof value === "object" && hasOwnProperty(value, "Object")) {
			const object = {};
			for (const [key, entry] of Object.entries(value.Object)) defineEnumerableProperty(object, key, decodeStructured(entry, depth + 1));
			return object;
		}
		throw new TypeError(`Unsupported structured value: ${JSON.stringify(value)}`);
	}
	function getEncodedStartOptionsSuffix(policy) {
		let cached = encodedStartOptionsSuffixCache.get(policy);
		if (cached !== void 0) return cached;
		cached = `,"capabilities":${JSON.stringify(policy.capabilities)},"limits":${JSON.stringify(policy.limits)}}`;
		encodedStartOptionsSuffixCache.set(policy, cached);
		return cached;
	}
	function writeLimitValue(writer, value) {
		writer.writeF64(value);
	}
	function writeEncodedLimits(writer, limits = {}) {
		let mask = 0;
		for (const [field, bit] of LIMIT_FIELD_LAYOUT) if (limits[field] !== void 0) mask |= bit;
		writer.writeU8(mask);
		for (const [field, bit] of LIMIT_FIELD_LAYOUT) if ((mask & bit) !== 0) writeLimitValue(writer, limits[field]);
	}
	function writeEncodedCapabilities(writer, capabilities = []) {
		writer.writeU32(capabilities.length);
		for (const capability of capabilities) writer.writeString(capability);
	}
	function getEncodedStartOptionsBinarySuffix(policy) {
		let cached = encodedStartOptionsBinarySuffixCache.get(policy);
		if (cached !== void 0) return cached;
		const writer = new BinaryWriter();
		writeEncodedCapabilities(writer, policy.capabilities);
		writeEncodedLimits(writer, policy.limits);
		cached = writer.toBuffer();
		encodedStartOptionsBinarySuffixCache.set(policy, cached);
		return cached;
	}
	function writeStructured(value, writer, traversal = { active: /* @__PURE__ */ new WeakSet() }, depth = 1) {
		assertBoundaryDepth(depth, "host boundary");
		if (value === void 0) {
			writer.writeU8(STRUCTURED_BINARY_TAG.UNDEFINED);
			return;
		}
		if (value === null) {
			writer.writeU8(STRUCTURED_BINARY_TAG.NULL);
			return;
		}
		if (typeof value === "boolean") {
			writer.writeU8(value ? STRUCTURED_BINARY_TAG.BOOL_TRUE : STRUCTURED_BINARY_TAG.BOOL_FALSE);
			return;
		}
		if (typeof value === "number") {
			if (Number.isNaN(value)) {
				writer.writeU8(STRUCTURED_BINARY_TAG.NUMBER_NAN);
				return;
			}
			if (Object.is(value, -0)) {
				writer.writeU8(STRUCTURED_BINARY_TAG.NUMBER_NEG_ZERO);
				return;
			}
			if (value === Infinity) {
				writer.writeU8(STRUCTURED_BINARY_TAG.NUMBER_INFINITY);
				return;
			}
			if (value === -Infinity) {
				writer.writeU8(STRUCTURED_BINARY_TAG.NUMBER_NEG_INFINITY);
				return;
			}
			writer.writeU8(STRUCTURED_BINARY_TAG.NUMBER_FINITE);
			writer.writeF64(value);
			return;
		}
		if (typeof value === "string") {
			writer.writeU8(STRUCTURED_BINARY_TAG.STRING);
			writer.writeString(value);
			return;
		}
		if (Array.isArray(value)) {
			assertNotProxy(value);
			assertBoundaryArrayLength(value.length, "host boundary");
			writer.writeU8(STRUCTURED_BINARY_TAG.ARRAY);
			writer.writeU32(value.length);
			const leave = enterStructuredTraversal(value, traversal);
			try {
				for (let index = 0; index < value.length; index += 1) {
					const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
					if (descriptor === void 0) {
						writer.writeU8(STRUCTURED_BINARY_TAG.HOLE);
						continue;
					}
					if (isAccessorDescriptor(descriptor)) throw new TypeError("host objects with accessors cannot cross the host boundary");
					writeStructured(descriptor.value, writer, traversal, depth + 1);
				}
			} finally {
				leave();
			}
			return;
		}
		if (typeof value === "object") {
			if (!isPlainStructuredObject(value)) throw new TypeError("Unsupported host value: only plain objects and arrays can cross the host boundary");
			writer.writeU8(STRUCTURED_BINARY_TAG.OBJECT);
			const entries = enumerateDataProperties(value);
			writer.writeU32(entries.length);
			const leave = enterStructuredTraversal(value, traversal);
			try {
				for (const [key, descriptor] of entries) {
					writer.writeString(key);
					writeStructured(descriptor.value, writer, traversal, depth + 1);
				}
			} finally {
				leave();
			}
			return;
		}
		throw new TypeError("Unsupported host value");
	}
	function writeStructuredInputEntries(writer, inputs = {}) {
		const entries = enumerateDataProperties(inputs);
		writer.writeU32(entries.length);
		for (const [key, descriptor] of entries) {
			writer.writeString(key);
			writeStructured(descriptor.value, writer);
		}
	}
	function encodeStructuredInputs(inputs = {}) {
		const encodedInputs = {};
		for (const [key, descriptor] of enumerateDataProperties(inputs)) defineEnumerableProperty(encodedInputs, key, encodeStructured(descriptor.value));
		return JSON.stringify(encodedInputs);
	}
	function encodeStartOptions(inputs = {}, policy) {
		return `{"inputs":${encodeStructuredInputs(inputs)}${getEncodedStartOptionsSuffix(policy)}`;
	}
	function encodeStructuredInputsBuffer(inputs = {}) {
		const writer = new BinaryWriter();
		writer.writeHeader(BOUNDARY_BINARY_KIND.STRUCTURED_INPUTS);
		writeStructuredInputEntries(writer, inputs);
		return writer.toBuffer();
	}
	function encodeStartOptionsBuffer(inputs = {}, policy) {
		const writer = new BinaryWriter();
		writer.writeHeader(BOUNDARY_BINARY_KIND.START_OPTIONS);
		writeStructuredInputEntries(writer, inputs);
		writer.writeBuffer(getEncodedStartOptionsBinarySuffix(policy));
		return writer.toBuffer();
	}
	function encodeResumePayloadValue(value) {
		return JSON.stringify({
			type: "value",
			value: encodeStructured(value)
		});
	}
	function encodeResumePayloadValueBuffer(value) {
		const writer = new BinaryWriter();
		writer.writeHeader(BOUNDARY_BINARY_KIND.RESUME_PAYLOAD);
		writer.writeU8(RESUME_BINARY_TAG.VALUE);
		writeStructured(value, writer);
		return writer.toBuffer();
	}
	function readOwnDataProperty(value, key, label) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor === void 0) return;
		if (isAccessorDescriptor(descriptor)) throw new TypeError(`${label} cannot use accessor-backed ${key} properties`);
		return descriptor.value;
	}
	function encodeResumePayloadError(error) {
		const source = error instanceof Error ? error : Object(error);
		assertNotProxy(source);
		const name = readOwnDataProperty(source, "name", "host errors");
		const message = readOwnDataProperty(source, "message", "host errors");
		const code = readOwnDataProperty(source, "code", "host errors");
		const details = readOwnDataProperty(source, "details", "host errors");
		return JSON.stringify({
			type: "error",
			error: {
				name: typeof name === "string" ? name : "Error",
				message: typeof message === "string" ? message : "",
				code: typeof code === "string" ? code : null,
				details: details === void 0 ? null : encodeStructured(details)
			}
		});
	}
	function encodeResumePayloadErrorBuffer(error) {
		const source = error instanceof Error ? error : Object(error);
		assertNotProxy(source);
		const name = readOwnDataProperty(source, "name", "host errors");
		const message = readOwnDataProperty(source, "message", "host errors");
		const code = readOwnDataProperty(source, "code", "host errors");
		const details = readOwnDataProperty(source, "details", "host errors");
		const writer = new BinaryWriter();
		writer.writeHeader(BOUNDARY_BINARY_KIND.RESUME_PAYLOAD);
		writer.writeU8(RESUME_BINARY_TAG.ERROR);
		writer.writeString(typeof name === "string" ? name : "Error");
		writer.writeString(typeof message === "string" ? message : "");
		if (typeof code === "string") {
			writer.writeU8(1);
			writer.writeString(code);
		} else writer.writeU8(0);
		if (details === void 0) writer.writeU8(0);
		else {
			writer.writeU8(1);
			writeStructured(details, writer);
		}
		return writer.toBuffer();
	}
	function encodeResumePayloadCancel() {
		return JSON.stringify({ type: "cancelled" });
	}
	function encodeResumePayloadCancelBuffer() {
		const writer = new BinaryWriter();
		writer.writeHeader(BOUNDARY_BINARY_KIND.RESUME_PAYLOAD);
		writer.writeU8(RESUME_BINARY_TAG.CANCELLED);
		return writer.toBuffer();
	}
	module.exports = {
		BOUNDARY_BINARY_KIND,
		decodeStructured,
		defineEnumerableProperty,
		encodeResumePayloadCancel,
		encodeResumePayloadCancelBuffer,
		encodeResumePayloadError,
		encodeResumePayloadErrorBuffer,
		encodeResumePayloadValue,
		encodeResumePayloadValueBuffer,
		encodeStartOptions,
		encodeStartOptionsBuffer,
		encodeStructuredInputs,
		encodeStructuredInputsBuffer,
		encodeStructured,
		enumerateDataProperties,
		hasOwnProperty,
		isAccessorDescriptor
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/policy.js
var require_policy = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const crypto = __require("node:crypto");
	const { types: types$2 } = __require("node:util");
	const { loadNative } = require_native_loader();
	const { MustardError, callNative } = require_errors();
	const { decodeStructured, defineEnumerableProperty, encodeStructured, hasOwnProperty, isAccessorDescriptor } = require_structured();
	const CONSOLE_CAPABILITY_NAMES = {
		log: "console.log",
		warn: "console.warn",
		error: "console.error"
	};
	const DEFAULT_SNAPSHOT_KEY = crypto.randomBytes(32);
	const encodedSnapshotPolicyPrefixCache = /* @__PURE__ */ new WeakMap();
	let nativeSnapshotHelpers;
	const executionContextHandleRegistry = typeof FinalizationRegistry === "function" ? new FinalizationRegistry((contextHandle) => {
		try {
			callNative(snapshotNative().releaseExecutionContext, contextHandle);
		} catch {}
	}) : null;
	function snapshotNative() {
		nativeSnapshotHelpers ??= loadNative();
		return nativeSnapshotHelpers;
	}
	function validatePlainHandlerContainer(value, label) {
		if (value === void 0) return null;
		if (value === null || typeof value !== "object" || Array.isArray(value) || types$2.isProxy(value)) throw new TypeError(`${label} must be a plain object`);
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
		return value;
	}
	function enumerateHandlerProperties(value, label) {
		const container = validatePlainHandlerContainer(value, label);
		if (container === null) return [];
		return Object.entries(Object.getOwnPropertyDescriptors(container)).filter(([, descriptor]) => {
			if (!descriptor.enumerable) return false;
			if (isAccessorDescriptor(descriptor)) throw new TypeError(`${label} cannot define accessor properties`);
			return true;
		});
	}
	function collectHostHandlers({ capabilities = {}, console = {} } = {}) {
		const handlers = {};
		for (const [name, descriptor] of enumerateHandlerProperties(capabilities, "options.capabilities")) defineEnumerableProperty(handlers, name, descriptor.value);
		const consoleDescriptors = new Map(enumerateHandlerProperties(console, "options.console"));
		for (const [method, capabilityName] of Object.entries(CONSOLE_CAPABILITY_NAMES)) {
			const descriptor = consoleDescriptors.get(method);
			if (!descriptor) continue;
			const handler = descriptor.value;
			if (typeof handler !== "function") throw new TypeError(`console.${method} must be a function`);
			if (handlers[capabilityName] !== void 0) throw new TypeError(`Duplicate handler for ${capabilityName}; use either options.console or options.capabilities`);
			handlers[capabilityName] = handler;
		}
		return handlers;
	}
	function encodeRuntimeLimits(limits = {}) {
		const encodedLimits = {};
		if (limits.instructionBudget !== void 0) encodedLimits.instruction_budget = limits.instructionBudget;
		if (limits.heapLimitBytes !== void 0) encodedLimits.heap_limit_bytes = limits.heapLimitBytes;
		if (limits.allocationBudget !== void 0) encodedLimits.allocation_budget = limits.allocationBudget;
		if (limits.callDepthLimit !== void 0) encodedLimits.call_depth_limit = limits.callDepthLimit;
		if (limits.maxOutstandingHostCalls !== void 0) encodedLimits.max_outstanding_host_calls = limits.maxOutstandingHostCalls;
		return encodedLimits;
	}
	function validateRuntimeLimitsObject(limits, label) {
		if (limits === void 0 || limits === null || typeof limits !== "object") throw new TypeError(`${label} must be a plain object`);
		if (Array.isArray(limits) || types$2.isProxy(limits)) throw new TypeError(`${label} must be a plain object`);
		const prototype = Object.getPrototypeOf(limits);
		if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
		return limits;
	}
	function cloneSnapshotPolicy(policy) {
		return {
			capabilities: policy.capabilities.slice(),
			limits: { ...policy.limits }
		};
	}
	function cloneSnapshotKey(snapshotKey) {
		return Buffer.from(snapshotKey);
	}
	function freezePolicy(policy) {
		return Object.freeze({
			capabilities: Object.freeze(policy.capabilities.slice()),
			limits: Object.freeze({ ...policy.limits })
		});
	}
	function getEncodedSnapshotPolicyPrefix(policy) {
		let cached = encodedSnapshotPolicyPrefixCache.get(policy);
		if (cached !== void 0) return cached;
		cached = `{"capabilities":${JSON.stringify(policy.capabilities)},"limits":${JSON.stringify(policy.limits)}`;
		encodedSnapshotPolicyPrefixCache.set(policy, cached);
		return cached;
	}
	function resolveSnapshotKeyEncoding(options) {
		if (typeof options?.snapshotKeyBase64 === "string" && options.snapshotKeyBase64.length > 0 && typeof options?.snapshotKeyDigest === "string" && options.snapshotKeyDigest.length > 0) return {
			snapshotKeyBase64: options.snapshotKeyBase64,
			snapshotKeyDigest: options.snapshotKeyDigest
		};
		if (options?.snapshotKey === void 0) return null;
		const snapshotKey = cloneSnapshotKey(options.snapshotKey);
		return {
			snapshotKeyBase64: snapshotKey.toString("base64"),
			snapshotKeyDigest: snapshotKeyDigest(snapshotKey)
		};
	}
	function assertNoContextOverrides(options, label) {
		if (hasOwnProperty(options, "capabilities") || hasOwnProperty(options, "console") || hasOwnProperty(options, "limits") || hasOwnProperty(options, "snapshotKey")) throw new TypeError(`${label}.context cannot be combined with capabilities, console, limits, or snapshotKey`);
	}
	var ExecutionContext = class {
		#hostHandlers;
		#policy;
		#policyJson;
		#snapshotKey;
		#snapshotKeyBase64;
		#snapshotKeyDigest;
		#nativeHandle;
		#nativeHandleToken;
		constructor(options = {}) {
			const { hostHandlers, policy, snapshotKey, snapshotKeyBase64, snapshotKeyDigest: snapshotKeyDigestValue } = createExecutionPolicy(options);
			this.#hostHandlers = hostHandlers;
			this.#policy = freezePolicy(policy);
			this.#policyJson = null;
			this.#snapshotKey = cloneSnapshotKey(snapshotKey);
			this.#snapshotKeyBase64 = snapshotKeyBase64;
			this.#snapshotKeyDigest = snapshotKeyDigestValue;
			this.#nativeHandle = null;
			this.#nativeHandleToken = null;
		}
		hostHandlers() {
			return this.#hostHandlers;
		}
		policy() {
			return this.#policy;
		}
		snapshotKey() {
			return cloneSnapshotKey(this.#snapshotKey);
		}
		snapshotKeyMetadata() {
			return {
				snapshotKey: cloneSnapshotKey(this.#snapshotKey),
				snapshotKeyBase64: this.#snapshotKeyBase64,
				snapshotKeyDigest: this.#snapshotKeyDigest
			};
		}
		policyJson() {
			this.#policyJson ??= JSON.stringify(this.#policy);
			return this.#policyJson;
		}
		nativeHandle() {
			if (this.#nativeHandle !== null) return this.#nativeHandle;
			const nativeHandle = callNative(snapshotNative().createExecutionContext, this.policyJson());
			this.#nativeHandle = nativeHandle;
			this.#nativeHandleToken = {};
			executionContextHandleRegistry?.register(this, nativeHandle, this.#nativeHandleToken);
			return nativeHandle;
		}
	};
	function resolveExecutionContext(options = {}, label = "options") {
		const context = options?.context;
		if (context === void 0) return createExecutionPolicy(options);
		if (!(context instanceof ExecutionContext)) throw new TypeError(`${label}.context must be an ExecutionContext`);
		assertNoContextOverrides(options, label);
		const snapshotKeyMetadata = context.snapshotKeyMetadata();
		return {
			hostHandlers: context.hostHandlers(),
			policy: context.policy(),
			nativeContextHandle: context.nativeHandle(),
			...snapshotKeyMetadata
		};
	}
	function encodeSnapshotPolicy(policy, options = void 0) {
		const chunks = [getEncodedSnapshotPolicyPrefix(policy)];
		if (typeof options?.snapshotId === "string" && options.snapshotId.length > 0) chunks.push(",\"snapshot_id\":", JSON.stringify(options.snapshotId));
		const snapshotKeyEncoding = resolveSnapshotKeyEncoding(options);
		if (snapshotKeyEncoding !== null) chunks.push(",\"snapshot_key_base64\":", JSON.stringify(snapshotKeyEncoding.snapshotKeyBase64), ",\"snapshot_key_digest\":", JSON.stringify(snapshotKeyEncoding.snapshotKeyDigest));
		if (typeof options?.snapshotToken === "string" && options.snapshotToken.length > 0) chunks.push(",\"snapshot_token\":", JSON.stringify(options.snapshotToken));
		chunks.push("}");
		return chunks.join("");
	}
	function normalizeSnapshotKey(snapshotKey, label) {
		if (snapshotKey === void 0) return cloneSnapshotKey(DEFAULT_SNAPSHOT_KEY);
		if (typeof snapshotKey === "string") return Buffer.from(snapshotKey, "utf8");
		if (Buffer.isBuffer(snapshotKey) || snapshotKey instanceof Uint8Array) return Buffer.from(snapshotKey);
		throw new TypeError(`${label} must be a string, Buffer, or Uint8Array`);
	}
	function snapshotToken(snapshot, snapshotKey, snapshotId = void 0) {
		const identity = snapshotId ?? snapshotIdentity(snapshot);
		return crypto.createHmac("sha256", snapshotKey).update(identity, "utf8").digest("hex");
	}
	function snapshotIdentity(snapshot) {
		return callNative(snapshotNative().snapshotIdentity, Buffer.from(snapshot));
	}
	function programIdentity(program) {
		return crypto.createHash("sha256").update(Buffer.from(program)).digest("hex");
	}
	function snapshotKeyDigest(snapshotKey) {
		return crypto.createHash("sha256").update(snapshotKey).digest("hex");
	}
	function suspendedManifestError() {
		return new MustardError("Serialization", "Progress.load() rejected tampered or unauthenticated suspended metadata");
	}
	function createSuspendedManifest(capability, args) {
		if (typeof capability !== "string" || capability.length === 0) throw new TypeError("Progress.dump() requires a suspended capability name");
		if (!Array.isArray(args)) throw new TypeError("Progress.dump() requires suspended args as an array");
		return JSON.stringify({
			capability,
			args: args.map((value) => encodeStructured(value))
		});
	}
	function parseSuspendedManifest(suspendedManifest) {
		try {
			const manifest = JSON.parse(suspendedManifest);
			if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw suspendedManifestError();
			if (typeof manifest.capability !== "string" || manifest.capability.length === 0) throw suspendedManifestError();
			if (!Array.isArray(manifest.args)) throw suspendedManifestError();
			return {
				capability: manifest.capability,
				args: manifest.args.map((value) => decodeStructured(value))
			};
		} catch (error) {
			if (error instanceof MustardError) throw error;
			throw suspendedManifestError();
		}
	}
	function suspendedManifestToken(snapshotId, suspendedManifest, snapshotKey) {
		return crypto.createHmac("sha256", snapshotKey).update(snapshotId, "utf8").update("\0", "utf8").update(suspendedManifest, "utf8").digest("hex");
	}
	function assertSuspendedManifest(state, snapshotKey, expectedSnapshotId) {
		const suspendedManifest = state.suspended_manifest;
		const token = state.suspended_manifest_token;
		if (suspendedManifest === void 0 && token === void 0) return null;
		if (typeof suspendedManifest !== "string" || suspendedManifest.length === 0 || typeof token !== "string" || token.length === 0) throw suspendedManifestError();
		const expected = suspendedManifestToken(expectedSnapshotId, suspendedManifest, snapshotKey);
		if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"))) throw suspendedManifestError();
		return parseSuspendedManifest(suspendedManifest);
	}
	function assertSnapshotToken(snapshot, token, snapshotKey, expectedSnapshotId = void 0, expectedSnapshotKeyDigest = void 0, actualSnapshotId = void 0) {
		if (typeof token !== "string" || token.length === 0) throw new TypeError("Progress.load() requires a dumped progress token");
		const resolvedSnapshotId = actualSnapshotId ?? snapshotIdentity(snapshot);
		if (expectedSnapshotId !== void 0 && resolvedSnapshotId !== expectedSnapshotId) throw new MustardError("Serialization", "Progress.load() rejected a tampered or unauthenticated snapshot");
		if (expectedSnapshotKeyDigest !== void 0 && snapshotKeyDigest(snapshotKey) !== expectedSnapshotKeyDigest) throw new MustardError("Serialization", "Progress.load() rejected a mismatched snapshot key digest");
		const expected = snapshotToken(snapshot, snapshotKey, resolvedSnapshotId);
		if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"))) throw new MustardError("Serialization", "Progress.load() rejected a tampered or unauthenticated snapshot");
	}
	function createExecutionPolicy({ limits = {}, snapshotKey, ...handlers } = {}) {
		const hostHandlers = collectHostHandlers(handlers);
		const normalizedSnapshotKey = normalizeSnapshotKey(snapshotKey, "options.snapshotKey");
		return {
			hostHandlers,
			policy: {
				capabilities: Object.keys(hostHandlers),
				limits: encodeRuntimeLimits(limits)
			},
			snapshotKey: normalizedSnapshotKey,
			snapshotKeyBase64: normalizedSnapshotKey.toString("base64"),
			snapshotKeyDigest: snapshotKeyDigest(normalizedSnapshotKey)
		};
	}
	function resolveProgressLoadContext(state, snapshot, options, actualSnapshotId = void 0) {
		const expectedSnapshotId = typeof state.snapshot_id === "string" && state.snapshot_id.length > 0 ? state.snapshot_id : void 0;
		const expectedSnapshotKeyDigest = typeof state.snapshot_key_digest === "string" && state.snapshot_key_digest.length > 0 ? state.snapshot_key_digest : void 0;
		if (expectedSnapshotId === void 0) throw new TypeError("Progress.load() requires dumped snapshot_id metadata");
		if (expectedSnapshotKeyDigest === void 0) throw new TypeError("Progress.load() requires dumped snapshot_key_digest metadata");
		if (options === void 0 || options === null || typeof options !== "object") throw new TypeError("Progress.load() requires an ExecutionContext or explicit capabilities, limits, and snapshotKey");
		if (hasOwnProperty(options, "context")) {
			const context = options.context;
			if (!(context instanceof ExecutionContext)) throw new TypeError("Progress.load() options.context must be an ExecutionContext");
			assertNoContextOverrides(options, "Progress.load() options");
			const snapshotKeyMetadata = context.snapshotKeyMetadata();
			assertSnapshotToken(snapshot, state.token, snapshotKeyMetadata.snapshotKey, expectedSnapshotId, expectedSnapshotKeyDigest, actualSnapshotId);
			return {
				policy: context.policy(),
				nativeContextHandle: context.nativeHandle(),
				...snapshotKeyMetadata
			};
		}
		if (!hasOwnProperty(options, "capabilities") && !hasOwnProperty(options, "console")) throw new TypeError("Progress.load() requires explicit capabilities when restoring progress");
		if (!hasOwnProperty(options, "limits")) throw new TypeError("Progress.load() requires explicit limits when restoring progress");
		const limits = validateRuntimeLimitsObject(options.limits, "Progress.load() options.limits");
		if (options.snapshotKey === void 0) throw new TypeError("Progress.load() requires explicit snapshotKey when restoring progress");
		const executionPolicy = createExecutionPolicy({
			...options,
			limits
		});
		assertSnapshotToken(snapshot, state.token, executionPolicy.snapshotKey, expectedSnapshotId, expectedSnapshotKeyDigest, actualSnapshotId);
		return {
			policy: executionPolicy.policy,
			snapshotKey: cloneSnapshotKey(executionPolicy.snapshotKey),
			snapshotKeyBase64: executionPolicy.snapshotKeyBase64,
			snapshotKeyDigest: executionPolicy.snapshotKeyDigest
		};
	}
	module.exports = {
		ExecutionContext,
		assertSuspendedManifest,
		cloneSnapshotPolicy,
		cloneSnapshotKey,
		collectHostHandlers,
		createSuspendedManifest,
		createExecutionPolicy,
		encodeRuntimeLimits,
		encodeSnapshotPolicy,
		normalizeSnapshotKey,
		parseSuspendedManifest,
		resolveExecutionContext,
		resolveProgressLoadContext,
		programIdentity,
		snapshotIdentity,
		snapshotKeyDigest,
		snapshotToken,
		suspendedManifestToken
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/executor.js
var require_executor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { createHmac, randomUUID } = __require("node:crypto");
	const { setTimeout: delay } = __require("node:timers/promises");
	const { types: types$1 } = __require("node:util");
	const { MustardError, normalizeNativeError } = require_errors();
	const { normalizeSnapshotKey } = require_policy();
	const TERMINAL_STATES = new Set([
		"completed",
		"failed",
		"cancelled"
	]);
	const RUNNABLE_STATES = new Set(["queued", "waiting"]);
	const DEFAULT_MAX_CONCURRENT_JOBS = 1;
	const DEFAULT_POLL_INTERVAL_MS = 25;
	const EXECUTOR_JOB_SNAPSHOT_KEY_LABEL = "mustard-executor-job-snapshot-key";
	function assertPlainObject(value, label) {
		if (value === null || typeof value !== "object" || Array.isArray(value) || types$1.isProxy(value)) throw new TypeError(`${label} must be a plain object`);
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
	}
	function cloneJobRecord(record) {
		return structuredClone(record);
	}
	function clonePersistedProgress(progress) {
		const cloned = {
			capability: progress.capability,
			args: structuredClone(progress.args),
			snapshot: Buffer.from(progress.snapshot),
			snapshot_id: progress.snapshot_id,
			snapshot_key_digest: progress.snapshot_key_digest,
			token: progress.token,
			suspended_manifest: typeof progress.suspended_manifest === "string" ? progress.suspended_manifest : void 0,
			suspended_manifest_token: typeof progress.suspended_manifest_token === "string" ? progress.suspended_manifest_token : void 0
		};
		if (Buffer.isBuffer(progress.program) || progress.program instanceof Uint8Array) cloned.program = Buffer.from(progress.program);
		if (typeof progress.program_id === "string") cloned.program_id = progress.program_id;
		return cloned;
	}
	function sanitizeFailure(error) {
		const normalized = normalizeNativeError(error);
		if (normalized instanceof MustardError) return {
			name: normalized.name,
			message: normalized.message
		};
		if (normalized && typeof normalized === "object") {
			const sanitized = {
				name: typeof normalized.name === "string" && normalized.name.length > 0 ? normalized.name : "Error",
				message: typeof normalized.message === "string" && normalized.message.length > 0 ? normalized.message : String(normalized)
			};
			if (typeof normalized.code === "string") sanitized.code = normalized.code;
			if (normalized.details !== void 0) sanitized.details = normalized.details;
			return sanitized;
		}
		return {
			name: "Error",
			message: String(normalized)
		};
	}
	function isCancellationFailure(error) {
		const normalized = normalizeNativeError(error);
		return normalized instanceof MustardError && normalized.kind === "Limit" && normalized.message.includes("execution cancelled");
	}
	function deriveJobSnapshotKey(snapshotKey, jobId) {
		return createHmac("sha256", snapshotKey).update(EXECUTOR_JOB_SNAPSHOT_KEY_LABEL, "utf8").update("\0", "utf8").update(String(jobId), "utf8").digest();
	}
	function validateTransition(currentState, nextState) {
		if (currentState === nextState) return;
		if (!new Set([
			"queued:running",
			"queued:cancelled",
			"running:waiting",
			"running:completed",
			"running:failed",
			"running:cancelled",
			"waiting:running",
			"waiting:failed",
			"waiting:cancelled"
		]).has(`${currentState}:${nextState}`)) throw new Error(`invalid job transition from ${currentState} to ${nextState}`);
	}
	async function waitForSignalOrDelay(signal, ms) {
		if (signal?.aborted) return;
		try {
			await delay(ms, void 0, { signal });
		} catch (error) {
			if (error?.name !== "AbortError") throw error;
		}
	}
	var InMemoryMustardExecutorStore = class {
		constructor() {
			this._jobs = /* @__PURE__ */ new Map();
			this._progress = /* @__PURE__ */ new Map();
			this._claims = /* @__PURE__ */ new Map();
			this._cancellationRequests = /* @__PURE__ */ new Set();
		}
		_jobs;
		_progress;
		_claims;
		_cancellationRequests;
		async enqueue(record) {
			if (this._jobs.has(record.jobId)) return {
				jobId: record.jobId,
				inserted: false
			};
			this._jobs.set(record.jobId, cloneJobRecord(record));
			return {
				jobId: record.jobId,
				inserted: true
			};
		}
		async get(jobId) {
			const record = this._jobs.get(jobId);
			return record ? cloneJobRecord(record) : null;
		}
		async claimRunnable(limit, workerId) {
			const claimed = [];
			for (const [jobId, record] of this._jobs.entries()) {
				if (claimed.length >= limit) break;
				if (!RUNNABLE_STATES.has(record.state)) continue;
				if (this._claims.has(jobId)) continue;
				this._claims.set(jobId, workerId);
				claimed.push(jobId);
			}
			return claimed;
		}
		async releaseClaim(jobId, workerId) {
			if (this._claims.get(jobId) === workerId) this._claims.delete(jobId);
		}
		async update(jobId, patch) {
			const current = this._jobs.get(jobId);
			if (!current) throw new Error(`unknown job id ${jobId}`);
			const nextState = patch.state ?? current.state;
			validateTransition(current.state, nextState);
			const next = {
				...current,
				...cloneJobRecord({
					...current,
					...patch
				}),
				state: nextState,
				updatedAt: Date.now()
			};
			this._jobs.set(jobId, next);
		}
		async saveProgress(jobId, progress) {
			const record = this._jobs.get(jobId);
			if (!record) throw new Error(`unknown job id ${jobId}`);
			if (TERMINAL_STATES.has(record.state)) throw new Error(`cannot save progress for terminal job ${jobId}`);
			this._progress.set(jobId, clonePersistedProgress(progress));
		}
		async loadProgress(jobId) {
			const progress = this._progress.get(jobId);
			return progress ? clonePersistedProgress(progress) : null;
		}
		async deleteProgress(jobId) {
			this._progress.delete(jobId);
		}
		async requestCancel(jobId) {
			const record = this._jobs.get(jobId);
			if (!record) return "ignored";
			if (TERMINAL_STATES.has(record.state)) return "ignored";
			if (record.state === "queued") {
				this._jobs.set(jobId, {
					...record,
					state: "cancelled",
					capability: void 0,
					args: void 0,
					result: void 0,
					error: {
						name: "MustardLimitError",
						message: "execution cancelled"
					},
					updatedAt: Date.now()
				});
				this._progress.delete(jobId);
				return "cancelled";
			}
			this._cancellationRequests.add(jobId);
			return "requested";
		}
		async consumeCancel(jobId) {
			if (!this._cancellationRequests.has(jobId)) return false;
			this._cancellationRequests.delete(jobId);
			return true;
		}
	};
	function createExecutorApi({ Mustard, Progress }) {
		class MustardExecutor {
			constructor(options) {
				if (options === null || typeof options !== "object") throw new TypeError("MustardExecutor options must be an object");
				const { program, capabilities, snapshotKey, store, limits = {} } = options;
				if (!(program instanceof Mustard)) throw new TypeError("MustardExecutor options.program must be a Mustard instance");
				assertPlainObject(capabilities, "MustardExecutor options.capabilities");
				if (store === void 0 || store === null || typeof store !== "object") throw new TypeError("MustardExecutor options.store must be a MustardExecutorStore");
				for (const method of [
					"enqueue",
					"get",
					"claimRunnable",
					"releaseClaim",
					"update",
					"saveProgress",
					"loadProgress",
					"deleteProgress",
					"requestCancel",
					"consumeCancel"
				]) if (typeof store[method] !== "function") throw new TypeError(`MustardExecutor options.store is missing ${method}()`);
				this._program = program;
				this._capabilities = capabilities;
				this._snapshotKey = normalizeSnapshotKey(snapshotKey, "MustardExecutor options.snapshotKey");
				this._store = store;
				this._limits = { ...limits };
			}
			_program;
			_capabilities;
			_snapshotKey;
			_store;
			_limits;
			async enqueue(input, options = {}) {
				assertPlainObject(input, "MustardExecutor.enqueue() input");
				if (options === null || typeof options !== "object") throw new TypeError("MustardExecutor.enqueue() options must be an object");
				const now = Date.now();
				const record = {
					jobId: options.jobId ?? randomUUID(),
					state: "queued",
					input: structuredClone(input),
					attempts: 0,
					createdAt: now,
					updatedAt: now
				};
				return (await this._store.enqueue(record)).jobId;
			}
			async get(jobId) {
				return this._store.get(jobId);
			}
			async cancel(jobId) {
				await this._store.requestCancel(jobId);
			}
			async runWorker(options = {}) {
				if (options === null || typeof options !== "object") throw new TypeError("MustardExecutor.runWorker() options must be an object");
				const workerId = randomUUID();
				const maxConcurrentJobs = options.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT_JOBS;
				if (!Number.isInteger(maxConcurrentJobs) || maxConcurrentJobs <= 0) throw new TypeError("MustardExecutor.runWorker() maxConcurrentJobs must be a positive integer");
				const signal = options.signal;
				const drain = options.drain === true;
				const inFlight = /* @__PURE__ */ new Set();
				while (!signal?.aborted) {
					const available = maxConcurrentJobs - inFlight.size;
					let claimed = [];
					if (available > 0) {
						claimed = await this._store.claimRunnable(available, workerId, Date.now());
						for (const jobId of claimed) {
							const task = this._processClaimedJob(jobId, workerId).finally(() => {
								inFlight.delete(task);
							});
							inFlight.add(task);
						}
					}
					if (drain && inFlight.size === 0 && claimed.length === 0) return;
					if (inFlight.size === 0) {
						await waitForSignalOrDelay(signal, DEFAULT_POLL_INTERVAL_MS);
						continue;
					}
					if (claimed.length === 0 || inFlight.size >= maxConcurrentJobs) await Promise.race(inFlight);
				}
				await Promise.allSettled(inFlight);
			}
			async _processClaimedJob(jobId, workerId) {
				try {
					const record = await this._store.get(jobId);
					if (record === null || TERMINAL_STATES.has(record.state)) return;
					if (record.state === "queued") {
						await this._store.update(jobId, {
							state: "running",
							attempts: record.attempts + 1,
							capability: void 0,
							args: void 0,
							result: void 0,
							error: void 0
						});
						let step;
						try {
							const snapshotKey = deriveJobSnapshotKey(this._snapshotKey, jobId);
							step = this._program.start({
								inputs: record.input,
								capabilities: this._capabilities,
								limits: this._limits,
								snapshotKey
							});
						} catch (error) {
							await this._failJob(jobId, error);
							return;
						}
						await this._driveExecution(jobId, step);
						return;
					}
					if (record.state === "waiting") await this._resumeWaitingJob(jobId, record);
				} finally {
					await this._store.releaseClaim(jobId, workerId);
				}
			}
			async _resumeWaitingJob(jobId, record) {
				const dumped = await this._store.loadProgress(jobId);
				if (dumped === null) {
					await this._failJob(jobId, new MustardError("Serialization", `missing stored progress for job ${jobId}`));
					return;
				}
				const snapshotKey = deriveJobSnapshotKey(this._snapshotKey, jobId);
				let progress;
				try {
					progress = Progress.load(dumped, {
						capabilities: this._capabilities,
						limits: this._limits,
						snapshotKey
					});
				} catch (error) {
					await this._failJob(jobId, error);
					return;
				}
				if (await this._store.consumeCancel(jobId)) {
					await this._store.update(jobId, {
						state: "running",
						capability: void 0,
						args: void 0
					});
					try {
						const step = progress.cancel();
						await this._driveExecution(jobId, step);
					} catch (error) {
						if (isCancellationFailure(error)) await this._cancelJob(jobId, error);
						else await this._failJob(jobId, error);
					}
					return;
				}
				const handler = this._capabilities[progress.capability];
				if (typeof handler !== "function") {
					await this._failJob(jobId, new MustardError("Runtime", `Missing capability: ${progress.capability}`));
					return;
				}
				let outcome;
				try {
					outcome = {
						type: "value",
						value: await handler(...progress.args)
					};
				} catch (error) {
					outcome = {
						type: "error",
						error
					};
				}
				await this._store.update(jobId, {
					state: "running",
					capability: void 0,
					args: void 0
				});
				try {
					const step = await this._store.consumeCancel(jobId) ? progress.cancel() : outcome.type === "value" ? progress.resume(outcome.value) : progress.resumeError(outcome.error);
					await this._driveExecution(jobId, step);
				} catch (error) {
					if (isCancellationFailure(error)) await this._cancelJob(jobId, error);
					else await this._failJob(jobId, error);
				}
			}
			async _driveExecution(jobId, step) {
				let current = step;
				while (current instanceof Progress) {
					await this._store.saveProgress(jobId, current.dump());
					await this._store.update(jobId, {
						state: "waiting",
						capability: current.capability,
						args: structuredClone(current.args)
					});
					await this._resumeWaitingJob(jobId, await this._store.get(jobId));
					return;
				}
				await this._store.update(jobId, {
					state: "completed",
					capability: void 0,
					args: void 0,
					result: current,
					error: void 0
				});
				await this._store.deleteProgress(jobId);
			}
			async _failJob(jobId, error) {
				await this._store.update(jobId, {
					state: "failed",
					capability: void 0,
					args: void 0,
					result: void 0,
					error: sanitizeFailure(error)
				});
				await this._store.deleteProgress(jobId);
			}
			async _cancelJob(jobId, error) {
				await this._store.update(jobId, {
					state: "cancelled",
					capability: void 0,
					args: void 0,
					result: void 0,
					error: sanitizeFailure(error)
				});
				await this._store.deleteProgress(jobId);
			}
		}
		return {
			InMemoryMustardExecutorStore,
			MustardExecutor
		};
	}
	module.exports = {
		createExecutorApi,
		InMemoryMustardExecutorStore
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/cancellation.js
var require_cancellation = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { types } = __require("node:util");
	const { MustardError, callNative } = require_errors();
	function throwIfAborted(signal) {
		if (signal?.aborted) throw new MustardError("Limit", "execution cancelled");
	}
	function getAbortSignal(options, label) {
		if (options === void 0) return;
		if (options === null || typeof options !== "object") throw new TypeError(`${label} must be an object`);
		const { signal } = options;
		if (signal === void 0) return;
		if (typeof signal !== "object" || signal === null || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function") throw new TypeError(`${label}.signal must be an AbortSignal`);
		return signal;
	}
	function withCancellationSignal(native, fn, args, signal) {
		if (signal === void 0) return callNative(fn, ...args);
		const tokenId = callNative(native.createCancellationToken);
		const cancel = () => {
			try {
				callNative(native.cancelCancellationToken, tokenId);
			} catch {}
		};
		if (signal.aborted) cancel();
		else signal.addEventListener("abort", cancel, { once: true });
		try {
			return callNative(fn, ...args, tokenId);
		} finally {
			if (!signal.aborted) signal.removeEventListener("abort", cancel);
			callNative(native.releaseCancellationToken, tokenId);
		}
	}
	async function settleCapabilityInvocation(capability, args, signal) {
		if (signal?.aborted) return { type: "cancelled" };
		let pending;
		try {
			pending = capability(...args);
		} catch (error) {
			return {
				type: "error",
				error
			};
		}
		if (!types.isPromise(pending)) return {
			type: "value",
			value: pending
		};
		if (signal === void 0) try {
			return {
				type: "value",
				value: await pending
			};
		} catch (error) {
			return {
				type: "error",
				error
			};
		}
		if (signal.aborted) {
			pending.catch(() => {});
			return { type: "cancelled" };
		}
		const ABORTED = Symbol("aborted");
		let onAbort = null;
		const raced = await Promise.race([pending.then((value) => ({
			type: "value",
			value
		}), (error) => ({
			type: "error",
			error
		})), new Promise((resolve) => {
			onAbort = () => resolve(ABORTED);
			signal.addEventListener("abort", onAbort, { once: true });
		})]);
		signal.removeEventListener("abort", onAbort);
		if (raced === ABORTED) {
			pending.catch(() => {});
			return { type: "cancelled" };
		}
		return raced;
	}
	module.exports = {
		getAbortSignal,
		settleCapabilityInvocation,
		throwIfAborted,
		withCancellationSignal
	};
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/progress.js
var require_progress = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const fs = __require("node:fs");
	const os = __require("node:os");
	const path = __require("node:path");
	const { performance } = __require("node:perf_hooks");
	const { MustardError, callNative } = require_errors();
	const { getAbortSignal, withCancellationSignal } = require_cancellation();
	const { assertSuspendedManifest, cloneSnapshotPolicy, cloneSnapshotKey, createSuspendedManifest, encodeSnapshotPolicy, programIdentity, resolveProgressLoadContext, snapshotIdentity, snapshotKeyDigest, snapshotToken, suspendedManifestToken } = require_policy();
	const { decodeStructured, encodeResumePayloadCancelBuffer, encodeResumePayloadErrorBuffer, encodeResumePayloadValueBuffer } = require_structured();
	const SHARED_PROGRESS_REGISTRY_ROOT = path.join(os.tmpdir(), "mustard-progress-registry", `${process.pid}-${Math.round(performance.timeOrigin)}`);
	function sharedProgressSnapshotPath(snapshotIdentityValue) {
		return path.join(SHARED_PROGRESS_REGISTRY_ROOT, snapshotIdentityValue);
	}
	function ensureSharedProgressRegistryRoot() {
		fs.mkdirSync(SHARED_PROGRESS_REGISTRY_ROOT, { recursive: true });
	}
	function isSharedProgressSnapshotUsed(snapshotIdentityValue) {
		ensureSharedProgressRegistryRoot();
		return fs.existsSync(sharedProgressSnapshotPath(snapshotIdentityValue));
	}
	function releaseSharedProgressSnapshot(snapshotIdentityValue) {
		try {
			fs.rmSync(sharedProgressSnapshotPath(snapshotIdentityValue));
		} catch (error) {
			if (error && typeof error === "object" && error.code !== "ENOENT") throw error;
		}
	}
	function claimSharedProgressSnapshot(snapshotIdentityValue) {
		ensureSharedProgressRegistryRoot();
		try {
			const fd = fs.openSync(sharedProgressSnapshotPath(snapshotIdentityValue), "wx", 384);
			fs.closeSync(fd);
			return true;
		} catch (error) {
			if (error && typeof error === "object" && error.code === "EEXIST") return false;
			throw error;
		}
	}
	function singleUseRuntimeError() {
		return new MustardError("Runtime", "Progress objects are single-use; this suspended execution was already resumed");
	}
	function releaseClaimedSnapshot(native, snapshotIdentityValue) {
		releaseSharedProgressSnapshot(snapshotIdentityValue);
	}
	function claimSnapshotForLoad(native, snapshotIdentityValue) {
		if (!claimSharedProgressSnapshot(snapshotIdentityValue)) throw singleUseRuntimeError();
		return () => {
			releaseClaimedSnapshot(native, snapshotIdentityValue);
		};
	}
	function assertSnapshotNotUsed(native, snapshotIdentityValue) {
		if (isSharedProgressSnapshotUsed(snapshotIdentityValue)) throw singleUseRuntimeError();
	}
	function isBinaryLike(value) {
		return Buffer.isBuffer(value) || value instanceof Uint8Array;
	}
	function createProgressApi(native) {
		const programHandleRegistry = typeof FinalizationRegistry === "function" ? new FinalizationRegistry((programHandle) => {
			try {
				callNative(native.releaseProgram, programHandle);
			} catch {}
		}) : null;
		const snapshotHandleRegistry = typeof FinalizationRegistry === "function" ? new FinalizationRegistry((snapshotHandle) => {
			try {
				callNative(native.releaseSnapshotHandle, snapshotHandle);
			} catch {}
		}) : null;
		function assertAuthorizedSuspendedCapability(policy, capability) {
			if (policy.capabilities.includes(capability)) return;
			throw new MustardError("Serialization", `snapshot policy rejected unauthorized capability \`${capability}\``);
		}
		class Progress {
			constructor(snapshot, capability, args, policy, snapshotKey, token = void 0, claimState = "unclaimed", suspendedManifest = void 0, suspendedManifestTokenValue = void 0, programHandle = null, program = void 0, programId = void 0, snapshotHandle = null, snapshotId = void 0, snapshotKeyBase64 = void 0, snapshotKeyDigestValue = void 0) {
				this.#capability = capability;
				this.#args = structuredClone(args);
				this.capability = this.#capability;
				this.args = structuredClone(this.#args);
				this.#snapshot = snapshot === void 0 || snapshot === null ? null : Buffer.from(snapshot);
				this.#snapshotIdentity = typeof snapshotId === "string" && snapshotId.length > 0 ? snapshotId : this.#snapshot !== null ? snapshotIdentity(this.#snapshot) : null;
				this.#snapshotKey = cloneSnapshotKey(snapshotKey);
				this.#snapshotKeyBase64 = typeof snapshotKeyBase64 === "string" && snapshotKeyBase64.length > 0 ? snapshotKeyBase64 : this.#snapshotKey.toString("base64");
				this.#snapshotKeyDigest = typeof snapshotKeyDigestValue === "string" && snapshotKeyDigestValue.length > 0 ? snapshotKeyDigestValue : snapshotKeyDigest(this.#snapshotKey);
				this.#snapshotToken = typeof token === "string" && token.length > 0 ? token : this.#snapshot !== null ? snapshotToken(this.#snapshot, this.#snapshotKey, this.#snapshotIdentity) : null;
				this.#suspendedManifest = suspendedManifest ?? createSuspendedManifest(this.#capability, this.#args);
				this.#suspendedManifestToken = typeof suspendedManifestTokenValue === "string" && suspendedManifestTokenValue.length > 0 ? suspendedManifestTokenValue : this.#snapshotIdentity === null ? null : suspendedManifestToken(this.#snapshotIdentity, this.#suspendedManifest, this.#snapshotKey);
				this.#policy = cloneSnapshotPolicy(policy);
				this.#snapshotPolicyJson = this.#snapshotIdentity === null || this.#snapshotToken === null ? null : encodeSnapshotPolicy(this.#policy, {
					snapshotId: this.#snapshotIdentity,
					snapshotKeyBase64: this.#snapshotKeyBase64,
					snapshotKeyDigest: this.#snapshotKeyDigest,
					snapshotToken: this.#snapshotToken
				});
				this.#claimState = claimState;
				this.#program = program === void 0 || program === null ? null : Buffer.from(program);
				this.#programIdentity = typeof programId === "string" && programId.length > 0 ? programId : this.#program !== null ? programIdentity(this.#program) : null;
				this.#programHandle = null;
				this.#programHandleToken = null;
				if (typeof programHandle === "string" && programHandle.length > 0) {
					this.#programHandle = programHandle;
					this.#programHandleToken = {};
					programHandleRegistry?.register(this, programHandle, this.#programHandleToken);
				}
				this.#snapshotHandle = null;
				this.#snapshotHandleToken = null;
				if (typeof snapshotHandle === "string" && snapshotHandle.length > 0) {
					this.#snapshotHandle = snapshotHandle;
					this.#snapshotHandleToken = {};
					snapshotHandleRegistry?.register(this, snapshotHandle, this.#snapshotHandleToken);
				}
			}
			#capability;
			#args;
			#snapshot;
			#snapshotIdentity;
			#snapshotKey;
			#snapshotKeyBase64;
			#snapshotKeyDigest;
			#snapshotToken;
			#suspendedManifest;
			#suspendedManifestToken;
			#policy;
			#snapshotPolicyJson;
			#claimState;
			#program;
			#programIdentity;
			#programHandle;
			#programHandleToken;
			#snapshotHandle;
			#snapshotHandleToken;
			#clearSnapshotHandle() {
				if (this.#snapshotHandleToken !== null) snapshotHandleRegistry?.unregister(this.#snapshotHandleToken);
				this.#snapshotHandle = null;
				this.#snapshotHandleToken = null;
			}
			#releaseSnapshotHandle() {
				if (this.#snapshotHandle === null) return;
				const snapshotHandle = this.#snapshotHandle;
				this.#clearSnapshotHandle();
				try {
					callNative(native.releaseSnapshotHandle, snapshotHandle);
				} catch {}
			}
			#ensureSnapshotBytes() {
				if (this.#snapshot !== null) return Buffer.from(this.#snapshot);
				if (this.#snapshotHandle === null) throw singleUseRuntimeError();
				this.#snapshot = Buffer.from(callNative(native.dumpSnapshotHandle, this.#snapshotHandle));
				this.#snapshotIdentity ??= snapshotIdentity(this.#snapshot);
				this.#snapshotToken ??= snapshotToken(this.#snapshot, this.#snapshotKey, this.#snapshotIdentity);
				this.#suspendedManifestToken ??= suspendedManifestToken(this.#snapshotIdentity, this.#suspendedManifest, this.#snapshotKey);
				this.#snapshotPolicyJson ??= encodeSnapshotPolicy(this.#policy, {
					snapshotId: this.#snapshotIdentity,
					snapshotKeyBase64: this.#snapshotKeyBase64,
					snapshotKeyDigest: this.#snapshotKeyDigest,
					snapshotToken: this.#snapshotToken
				});
				return Buffer.from(this.#snapshot);
			}
			#ensureSnapshotPolicyJson() {
				if (this.#snapshotPolicyJson !== null) return this.#snapshotPolicyJson;
				const snapshot = this.#ensureSnapshotBytes();
				this.#snapshotIdentity ??= snapshotIdentity(snapshot);
				this.#snapshotToken ??= snapshotToken(snapshot, this.#snapshotKey, this.#snapshotIdentity);
				this.#snapshotPolicyJson = encodeSnapshotPolicy(this.#policy, {
					snapshotId: this.#snapshotIdentity,
					snapshotKeyBase64: this.#snapshotKeyBase64,
					snapshotKeyDigest: this.#snapshotKeyDigest,
					snapshotToken: this.#snapshotToken
				});
				return this.#snapshotPolicyJson;
			}
			#consumeSnapshot() {
				if (this.#claimState === "consumed") throw singleUseRuntimeError();
				if (this.#claimState === "claimed") {
					this.#claimState = "consumed";
					return Buffer.from(this.#snapshot);
				}
				if (!claimSharedProgressSnapshot(this.#snapshotIdentity)) throw singleUseRuntimeError();
				this.#claimState = "consumed";
				return Buffer.from(this.#snapshot);
			}
			#consumeSnapshotHandle() {
				if (this.#claimState === "consumed") throw singleUseRuntimeError();
				if (this.#claimState === "unclaimed" && this.#snapshotIdentity !== null && !claimSharedProgressSnapshot(this.#snapshotIdentity)) throw singleUseRuntimeError();
				if (this.#snapshotHandle === null) return null;
				const snapshotHandle = this.#snapshotHandle;
				this.#clearSnapshotHandle();
				this.#claimState = "consumed";
				return snapshotHandle;
			}
			#ensureProgramHandle() {
				if (this.#programHandle !== null) return this.#programHandle;
				if (this.#program === null) return null;
				const programHandle = callNative(native.loadProgram, Buffer.from(this.#program));
				this.#programHandle = programHandle;
				this.#programHandleToken = {};
				programHandleRegistry?.register(this, programHandle, this.#programHandleToken);
				return programHandle;
			}
			#ensureProgramBytes() {
				if (this.#program !== null) return Buffer.from(this.#program);
				if (this.#programHandle === null) return null;
				this.#program = Buffer.from(callNative(native.dumpProgram, this.#programHandle));
				this.#programIdentity ??= programIdentity(this.#program);
				return Buffer.from(this.#program);
			}
			#resumeWithPayload(payload, signal) {
				const programHandle = this.#ensureProgramHandle();
				const snapshotHandle = this.#consumeSnapshotHandle();
				if (snapshotHandle !== null) try {
					const nativeArgs = [snapshotHandle, payload];
					return materializeStep(parseStep(signal === void 0 ? callNative(native.resumeSnapshotHandleBuffer, ...nativeArgs) : withCancellationSignal(native, native.resumeSnapshotHandleBuffer, nativeArgs, signal)), this.#policy, this.#snapshotKey, programHandle, this.#program);
				} finally {
					try {
						callNative(native.releaseSnapshotHandle, snapshotHandle);
					} catch {}
				}
				const snapshot = this.#consumeSnapshot();
				const policyJson = this.#ensureSnapshotPolicyJson();
				const nativeResume = programHandle === null ? native.resumeProgram : native.resumeDetachedProgram;
				const nativeArgs = programHandle === null ? [
					snapshot,
					payload,
					policyJson
				] : [
					programHandle,
					snapshot,
					payload,
					policyJson
				];
				return materializeStep(parseStep(signal === void 0 ? callNative(nativeResume, ...nativeArgs) : withCancellationSignal(native, nativeResume, nativeArgs, signal)), this.#policy, this.#snapshotKey, programHandle, this.#program);
			}
			get snapshot() {
				return this.#ensureSnapshotBytes();
			}
			dump() {
				const snapshot = this.#ensureSnapshotBytes();
				this.#snapshotIdentity ??= snapshotIdentity(snapshot);
				this.#snapshotToken ??= snapshotToken(snapshot, this.#snapshotKey, this.#snapshotIdentity);
				this.#suspendedManifestToken ??= suspendedManifestToken(this.#snapshotIdentity, this.#suspendedManifest, this.#snapshotKey);
				const dumped = {
					capability: this.#capability,
					args: structuredClone(this.#args),
					snapshot,
					snapshot_id: this.#snapshotIdentity,
					snapshot_key_digest: this.#snapshotKeyDigest,
					token: this.#snapshotToken,
					suspended_manifest: this.#suspendedManifest,
					suspended_manifest_token: this.#suspendedManifestToken
				};
				const program = this.#ensureProgramBytes();
				if (program !== null) {
					dumped.program = program;
					dumped.program_id = this.#programIdentity ?? programIdentity(program);
				}
				return dumped;
			}
			resume(value, options = void 0) {
				const signal = getAbortSignal(options, "resume options");
				if (signal?.aborted) return this.cancel();
				return this.#resumeWithPayload(encodeResumePayloadValueBuffer(value), signal);
			}
			resumeError(error, options = void 0) {
				const signal = getAbortSignal(options, "resume options");
				if (signal?.aborted) return this.cancel();
				return this.#resumeWithPayload(encodeResumePayloadErrorBuffer(error), signal);
			}
			cancel() {
				return this.#resumeWithPayload(encodeResumePayloadCancelBuffer(), void 0);
			}
			static load(state, options = void 0) {
				if (!state || typeof state !== "object") throw new TypeError("Progress.load() expects a dumped progress object");
				if (!state.snapshot) throw new TypeError("Progress.load() requires snapshot bytes");
				if (typeof state.snapshot_id !== "string" || state.snapshot_id.length === 0) throw new TypeError("Progress.load() requires dumped snapshot_id metadata");
				if (typeof state.snapshot_key_digest !== "string" || state.snapshot_key_digest.length === 0) throw new TypeError("Progress.load() requires dumped snapshot_key_digest metadata");
				if (typeof state.token !== "string" || state.token.length === 0) throw new TypeError("Progress.load() requires a dumped progress token");
				const snapshot = Buffer.from(state.snapshot);
				let snapshotIdentityValue;
				try {
					snapshotIdentityValue = snapshotIdentity(snapshot);
				} catch (error) {
					if (error instanceof MustardError && error.kind === "Serialization") throw new MustardError("Serialization", "Progress.load() rejected a tampered or unauthenticated snapshot", error);
					throw error;
				}
				if (state.snapshot_id !== snapshotIdentityValue) throw new MustardError("Serialization", "Progress.load() rejected a tampered or unauthenticated snapshot");
				let dumpedProgram;
				let dumpedProgramId;
				if (state.program !== void 0) {
					if (!isBinaryLike(state.program)) throw new TypeError("Progress.load() requires dumped program bytes as Buffer or Uint8Array");
					if (typeof state.program_id !== "string" || state.program_id.length === 0) throw new TypeError("Progress.load() requires dumped program_id metadata when program bytes are present");
					dumpedProgram = Buffer.from(state.program);
					dumpedProgramId = programIdentity(dumpedProgram);
					if (dumpedProgramId !== state.program_id) throw new MustardError("Serialization", "Progress.load() rejected a tampered or mismatched detached program");
				}
				assertSnapshotNotUsed(native, snapshotIdentityValue);
				const context = resolveProgressLoadContext(state, snapshot, options, snapshotIdentityValue);
				const suspendedManifest = assertSuspendedManifest(state, context.snapshotKey, snapshotIdentityValue);
				const nativeContextHandle = typeof context.nativeContextHandle === "string" && context.nativeContextHandle.length > 0 ? context.nativeContextHandle : null;
				const policyJson = nativeContextHandle === null ? encodeSnapshotPolicy(context.policy, {
					snapshotId: state.snapshot_id,
					snapshotKey: context.snapshotKey,
					snapshotKeyBase64: context.snapshotKeyBase64,
					snapshotKeyDigest: context.snapshotKeyDigest,
					snapshotToken: state.token
				}) : null;
				const releaseClaim = claimSnapshotForLoad(native, snapshotIdentityValue);
				try {
					let loadedProgramHandle = null;
					let snapshotHandle = null;
					const loadSnapshotHandle = () => {
						if (dumpedProgram === void 0) return nativeContextHandle === null ? callNative(native.loadSnapshotHandle, snapshot, policyJson) : callNative(native.loadSnapshotHandleWithExecutionContext, nativeContextHandle, snapshot, state.snapshot_id, context.snapshotKeyBase64, context.snapshotKeyDigest, state.token);
						loadedProgramHandle = callNative(native.loadProgram, Buffer.from(dumpedProgram));
						return nativeContextHandle === null ? callNative(native.loadDetachedSnapshotHandle, loadedProgramHandle, snapshot, policyJson) : callNative(native.loadDetachedSnapshotHandleWithExecutionContext, loadedProgramHandle, nativeContextHandle, snapshot, state.snapshot_id, context.snapshotKeyBase64, context.snapshotKeyDigest, state.token);
					};
					if (suspendedManifest !== null) {
						assertAuthorizedSuspendedCapability(context.policy, suspendedManifest.capability);
						try {
							snapshotHandle = loadSnapshotHandle();
						} catch (error) {
							if (loadedProgramHandle !== null) try {
								callNative(native.releaseProgram, loadedProgramHandle);
							} catch {}
							throw error;
						}
						return new Progress(snapshot, suspendedManifest.capability, suspendedManifest.args, context.policy, context.snapshotKey, state.token, "claimed", state.suspended_manifest, state.suspended_manifest_token, loadedProgramHandle, dumpedProgram, dumpedProgramId, snapshotHandle, state.snapshot_id, context.snapshotKeyBase64, context.snapshotKeyDigest);
					}
					try {
						snapshotHandle = loadSnapshotHandle();
						const inspection = parseSnapshotInspection(callNative(native.inspectSnapshotHandle, snapshotHandle));
						return new Progress(snapshot, inspection.capability, inspection.args, context.policy, context.snapshotKey, state.token, "claimed", void 0, void 0, loadedProgramHandle, dumpedProgram, dumpedProgramId, snapshotHandle, state.snapshot_id, context.snapshotKeyBase64, context.snapshotKeyDigest);
					} catch (error) {
						if (snapshotHandle !== null) try {
							callNative(native.releaseSnapshotHandle, snapshotHandle);
						} catch {}
						if (loadedProgramHandle !== null) try {
							callNative(native.releaseProgram, loadedProgramHandle);
						} catch {}
						throw error;
					}
				} catch (error) {
					releaseClaim();
					throw error;
				}
			}
		}
		function parseStep(stepJson) {
			const step = JSON.parse(stepJson);
			if (step.type === "completed") return {
				type: "completed",
				value: decodeStructured(step.value)
			};
			return {
				type: "suspended",
				capability: step.capability,
				args: step.args.map(decodeStructured),
				snapshot: typeof step.snapshot_base64 === "string" ? Buffer.from(step.snapshot_base64, "base64") : null,
				snapshotHandle: typeof step.snapshot_handle === "string" && step.snapshot_handle.length > 0 ? step.snapshot_handle : null
			};
		}
		function parseSnapshotInspection(inspectionJson) {
			const inspection = JSON.parse(inspectionJson);
			return {
				capability: inspection.capability,
				args: inspection.args.map(decodeStructured)
			};
		}
		function materializeStep(step, policy, snapshotKey, programHandle = null, program = void 0) {
			if (step.type === "completed") return step.value;
			let ownedProgramHandle = null;
			if (typeof programHandle === "string" && programHandle.length > 0) ownedProgramHandle = callNative(native.retainProgram, programHandle);
			return new Progress(step.snapshot, step.capability, step.args, policy, snapshotKey, void 0, "unclaimed", void 0, void 0, ownedProgramHandle, program, void 0, step.snapshotHandle);
		}
		return {
			Progress,
			materializeStep,
			parseStep
		};
	}
	module.exports = { createProgressApi };
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/lib/runtime.js
var require_runtime = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { callNative } = require_errors();
	const { getAbortSignal, settleCapabilityInvocation, throwIfAborted, withCancellationSignal } = require_cancellation();
	const { resolveExecutionContext } = require_policy();
	const { encodeResumePayloadCancelBuffer, encodeResumePayloadErrorBuffer, encodeResumePayloadValueBuffer, encodeStartOptionsBuffer, encodeStructuredInputsBuffer } = require_structured();
	function createMustardClass({ native, materializeStep, parseStep }) {
		const programHandleRegistry = typeof FinalizationRegistry === "function" ? new FinalizationRegistry((programHandle) => {
			try {
				callNative(native.releaseProgram, programHandle);
			} catch {}
		}) : null;
		function compileOptionsJson(options = {}) {
			if (options === null || typeof options !== "object" || Array.isArray(options)) throw new TypeError("compile options must be a plain object");
			if (options.lenientMode === void 0 || options.lenientMode === false) return null;
			if (options.lenientMode !== true) throw new TypeError("options.lenientMode must be a boolean");
			return "{\"lenient_mode\":true}";
		}
		function compileProgram(code, options = {}) {
			const optionsJson = compileOptionsJson(options);
			if (optionsJson !== null) return callNative(native.compileProgramWithOptions, code, optionsJson);
			return callNative(native.compileProgram, code);
		}
		function releaseProgram(programHandle) {
			callNative(native.releaseProgram, programHandle);
		}
		return class Mustard {
			constructor(code, options = {}) {
				this._programHandle = compileProgram(code, options);
				this._program = null;
				this._inputNames = options.inputs ?? [];
				this._programHandleToken = {};
				programHandleRegistry?.register(this, this._programHandle, this._programHandleToken);
			}
			static validateProgram(code, options = {}) {
				releaseProgram(compileProgram(code, options));
			}
			_ensureProgramHandle() {
				if (this._programHandle !== null) return this._programHandle;
				const programHandle = callNative(native.loadProgram, this._program);
				this._programHandle = programHandle;
				this._programHandleToken = {};
				programHandleRegistry?.register(this, programHandle, this._programHandleToken);
				return programHandle;
			}
			async run(options = {}) {
				const signal = getAbortSignal(options, "run options");
				throwIfAborted(signal);
				const { hostHandlers, policy, nativeContextHandle } = resolveExecutionContext(options, "run options");
				const programHandle = this._ensureProgramHandle();
				let step = parseStep(withCancellationSignal(native, typeof nativeContextHandle === "string" && nativeContextHandle.length > 0 ? native.startProgramWithExecutionContextHandleBuffer : native.startProgramWithSnapshotHandleBuffer, typeof nativeContextHandle === "string" && nativeContextHandle.length > 0 ? [
					programHandle,
					nativeContextHandle,
					encodeStructuredInputsBuffer(options.inputs)
				] : [programHandle, encodeStartOptionsBuffer(options.inputs, policy)], signal));
				while (step.type === "suspended") {
					const snapshotHandle = step.snapshotHandle;
					try {
						const capability = hostHandlers[step.capability];
						if (typeof capability !== "function") throw new Error(`Missing capability: ${step.capability}`);
						const outcome = await settleCapabilityInvocation(capability, step.args, signal);
						if (outcome.type === "cancelled") {
							step = parseStep(callNative(native.resumeSnapshotHandleBuffer, snapshotHandle, encodeResumePayloadCancelBuffer()));
							continue;
						}
						const payload = outcome.type === "value" ? encodeResumePayloadValueBuffer(outcome.value) : encodeResumePayloadErrorBuffer(outcome.error);
						step = parseStep(withCancellationSignal(native, native.resumeSnapshotHandleBuffer, [snapshotHandle, payload], signal));
					} finally {
						if (typeof snapshotHandle === "string" && snapshotHandle.length > 0) try {
							callNative(native.releaseSnapshotHandle, snapshotHandle);
						} catch {}
					}
				}
				return step.value;
			}
			start(options = {}) {
				const signal = getAbortSignal(options, "start options");
				throwIfAborted(signal);
				const { policy, snapshotKey, nativeContextHandle } = resolveExecutionContext(options, "start options");
				const programHandle = this._ensureProgramHandle();
				return materializeStep(parseStep(withCancellationSignal(native, typeof nativeContextHandle === "string" && nativeContextHandle.length > 0 ? native.startProgramWithExecutionContextHandleBuffer : native.startProgramWithSnapshotHandleBuffer, typeof nativeContextHandle === "string" && nativeContextHandle.length > 0 ? [
					programHandle,
					nativeContextHandle,
					encodeStructuredInputsBuffer(options.inputs)
				] : [programHandle, encodeStartOptionsBuffer(options.inputs, policy)], signal)), policy, snapshotKey, programHandle);
			}
			dump() {
				if (this._program === null) this._program = Buffer.from(callNative(native.dumpProgram, this._ensureProgramHandle()));
				return Buffer.from(this._program);
			}
			static load(buffer) {
				const instance = Object.create(Mustard.prototype);
				instance._program = Buffer.from(buffer);
				instance._programHandle = null;
				instance._inputNames = [];
				instance._programHandleToken = {};
				return instance;
			}
		};
	}
	module.exports = { createMustardClass };
}));

//#endregion
//#region ../../node_modules/.bun/mustardscript@0.2.1/node_modules/mustardscript/dist/index.js
var require_dist = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	const { loadNative } = require_native_loader();
	const { createExecutorApi } = require_executor();
	const { MustardError } = require_errors();
	const { ExecutionContext } = require_policy();
	const { createProgressApi } = require_progress();
	const { createMustardClass } = require_runtime();
	const native = loadNative();
	const { Progress, materializeStep, parseStep } = createProgressApi(native);
	const Mustard = createMustardClass({
		native,
		materializeStep,
		parseStep
	});
	const { InMemoryMustardExecutorStore, MustardExecutor } = createExecutorApi({
		Mustard,
		Progress
	});
	module.exports = {
		ExecutionContext,
		InMemoryMustardExecutorStore,
		MustardError,
		Mustard,
		MustardExecutor,
		Progress
	};
}));

//#endregion
export default require_dist();

export {  };