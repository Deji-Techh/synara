"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFixturesDir = resolveFixturesDir;
exports.resolveDumpDir = resolveDumpDir;
/**
 * Path resolution for the fake-LLM server that works in BOTH runtime layouts:
 *
 *   - Compiled CLI (Playwright): `__dirname` is `testing/fake-llm-server/dist`,
 *     so the repo root is three levels up.
 *   - In-process (vitest chat-flow harness): `__dirname` is
 *     `testing/fake-llm-server` (no `dist`), so the repo root is two levels up.
 *
 * Rather than hard-code either depth, we walk up looking for `e2e-tests/fixtures`.
 * `FAKE_LLM_FIXTURES_DIR` (set by the harness) short-circuits the search.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
let cachedFixturesDir;
function resolveFixturesDir() {
    if (process.env.FAKE_LLM_FIXTURES_DIR) {
        return process.env.FAKE_LLM_FIXTURES_DIR;
    }
    if (cachedFixturesDir) {
        return cachedFixturesDir;
    }
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        const candidate = node_path_1.default.join(dir, "e2e-tests", "fixtures");
        if (node_fs_1.default.existsSync(candidate)) {
            cachedFixturesDir = candidate;
            return candidate;
        }
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    // Legacy compiled-layout assumption as a last resort.
    return node_path_1.default.join(__dirname, "..", "..", "..", "e2e-tests", "fixtures");
}
/** Directory the fake server writes `[dump]` request bodies into. */
function resolveDumpDir() {
    return process.env.FAKE_LLM_DUMP_DIR || node_path_1.default.join(__dirname, "generated");
}
