"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDeviceCode = handleDeviceCode;
exports.handleAccessToken = handleAccessToken;
exports.handleUser = handleUser;
exports.handleUserEmails = handleUserEmails;
exports.handleUserRepos = handleUserRepos;
exports.handleRepo = handleRepo;
exports.handleRepoBranches = handleRepoBranches;
exports.handleOrgRepos = handleOrgRepos;
exports.handleRepoCollaborators = handleRepoCollaborators;
exports.handleGetPushEvents = handleGetPushEvents;
exports.handleClearPushEvents = handleClearPushEvents;
exports.handleResetRepos = handleResetRepos;
exports.handleGitPush = handleGitPush;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const log_1 = require("./log");
const gitHttpMiddlewareFactory = require("git-http-mock-server/middleware");
const pushEvents = [];
// Parse the git receive-pack protocol body for ref updates
// ("old-sha new-sha refs/heads/branch-name") and record them for the
// /github/api/test/push-events endpoint.
function recordPushEvents(repoName, body) {
    const events = [];
    try {
        const lines = body.split("\n");
        lines.forEach((line) => {
            const refMatch = line.match(
            // eslint-disable-next-line
            /([0-9a-f]{40})\s+([0-9a-f]{40})\s+refs\/heads\/([^\s\u0000]+)/);
            if (refMatch) {
                const [, oldSha, newSha, branchName] = refMatch;
                const isDelete = newSha === "0".repeat(40);
                const isCreate = oldSha === "0".repeat(40);
                let operation = "push";
                if (isDelete)
                    operation = "delete";
                else if (isCreate)
                    operation = "create";
                const event = {
                    timestamp: new Date(),
                    repo: repoName,
                    branch: branchName,
                    operation,
                    commitSha: isDelete ? oldSha : newSha,
                };
                events.push(event);
                pushEvents.push(event);
                (0, log_1.fakeLlmLog)(`* Recorded ${operation} to ${repoName}/${branchName}, commit: ${isDelete ? oldSha : newSha}`);
            }
        });
    }
    catch (error) {
        console.error("* Error parsing git protocol:", error);
    }
    return events;
}
function ensureBareRepoHeadTracksCreatedBranch(bareRepoPath, events) {
    const createdBranch = events.find((event) => event.operation === "create")?.branch;
    if (!createdBranch) {
        return;
    }
    let headRef;
    try {
        headRef = (0, child_process_1.execFileSync)("git", ["--git-dir", bareRepoPath, "symbolic-ref", "--quiet", "HEAD"], { stdio: ["ignore", "pipe", "pipe"] })
            .toString()
            .trim();
    }
    catch {
        return;
    }
    try {
        (0, child_process_1.execFileSync)("git", ["--git-dir", bareRepoPath, "show-ref", "--verify", "--quiet", headRef], { stdio: "ignore" });
        return;
    }
    catch {
        // Continue below: HEAD points at a default branch ref that has not been
        // created, so clones need it retargeted to the first pushed branch.
    }
    try {
        (0, child_process_1.execFileSync)("git", [
            "--git-dir",
            bareRepoPath,
            "symbolic-ref",
            "HEAD",
            `refs/heads/${createdBranch}`,
        ], { stdio: "pipe" });
    }
    catch (error) {
        console.warn("* Warning: failed to set symbolic-ref HEAD on bare repo", error);
    }
}
// Mock data for testing
const mockAccessToken = "fake_access_token_12345";
const mockDeviceCode = "fake_device_code_12345";
const mockUserCode = "FAKE-CODE";
const mockUser = {
    login: "testuser",
    id: 12345,
    email: "testuser@example.com",
};
let mockReposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dyad-git-mock-"));
const mockRepos = [
    {
        id: 1,
        name: "test-repo-1",
        full_name: "testuser/test-repo-1",
        private: false,
        owner: { login: "testuser" },
        default_branch: "main",
    },
    {
        id: 2,
        name: "test-repo-2",
        full_name: "testuser/test-repo-2",
        private: true,
        owner: { login: "testuser" },
        default_branch: "main",
    },
    {
        id: 3,
        name: "existing-app",
        full_name: "testuser/existing-app",
        private: false,
        owner: { login: "testuser" },
        default_branch: "main",
    },
    // A repo that is pre-seeded with real content (Vite app) so it can be
    // cloned/imported. Kept separate from the empty "create new repo" / sync
    // push-target repos above, whose first push must be a fresh fast-forward.
    {
        id: 4,
        name: "existing-vite-app",
        full_name: "testuser/existing-vite-app",
        private: false,
        owner: { login: "testuser" },
        default_branch: "main",
    },
];
const mockBranches = [
    { name: "main", commit: { sha: "abc123" } },
    { name: "develop", commit: { sha: "def456" } },
    { name: "feature/test", commit: { sha: "ghi789" } },
];
// Simple in-memory collaborator store keyed by full repo name
const repoCollaborators = {};
// Store device flow state
let deviceFlowState = {
    deviceCode: mockDeviceCode,
    userCode: mockUserCode,
    authorized: false,
    pollCount: 0,
};
// GitHub Device Flow - Step 1: Get device code
function handleDeviceCode(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Device Code requested");
    // Reset state for new flow
    deviceFlowState = {
        deviceCode: mockDeviceCode,
        userCode: mockUserCode,
        authorized: false,
        pollCount: 0,
    };
    res.json({
        device_code: mockDeviceCode,
        user_code: mockUserCode,
        verification_uri: "https://github.com/login/device",
        verification_uri_complete: `https://github.com/login/device?user_code=${mockUserCode}`,
        expires_in: 900,
        interval: 1, // Short interval for testing
    });
}
// GitHub Device Flow - Step 2: Poll for access token
function handleAccessToken(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Access Token polling", {
        pollCount: deviceFlowState.pollCount,
    });
    const { device_code } = req.body;
    if (device_code !== mockDeviceCode) {
        return res.status(400).json({
            error: "invalid_request",
            error_description: "Invalid device code",
        });
    }
    deviceFlowState.pollCount++;
    // Simulate authorization after 3 polls (for testing)
    if (deviceFlowState.pollCount >= 3) {
        deviceFlowState.authorized = true;
        return res.json({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "repo,user,workflow",
        });
    }
    // Return pending status
    res.status(400).json({
        error: "authorization_pending",
        error_description: "The authorization request is still pending",
    });
}
// Get authenticated user info
function handleUser(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub User info requested");
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    res.json(mockUser);
}
// Get user emails
function handleUserEmails(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub User emails requested");
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    res.json([
        {
            email: "testuser@example.com",
            primary: true,
            verified: true,
            visibility: "public",
        },
    ]);
}
// List user repositories
function handleUserRepos(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub User repos requested");
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    if (req.method === "GET") {
        // List repos
        res.json(mockRepos);
    }
    else if (req.method === "POST") {
        // Create repo
        const { name, private: isPrivate } = req.body;
        (0, log_1.fakeLlmLog)("* Creating repository:", name);
        // Check if repo already exists
        const existingRepo = mockRepos.find((repo) => repo.name === name);
        if (existingRepo) {
            return res.status(422).json({
                message: "Repository creation failed.",
                errors: [
                    {
                        resource: "Repository",
                        code: "already_exists",
                        field: "name",
                    },
                ],
            });
        }
        // Create new repo
        const newRepo = {
            id: mockRepos.length + 1,
            name,
            full_name: `${mockUser.login}/${name}`,
            private: !!isPrivate,
            owner: { login: mockUser.login },
            default_branch: "main",
        };
        mockRepos.push(newRepo);
        repoCollaborators[newRepo.full_name] = [
            {
                login: mockUser.login,
                avatar_url: "https://example.com/avatar.png",
                permissions: { admin: true, push: true, pull: true },
            },
        ];
        res.status(201).json(newRepo);
    }
}
// Get repository info
function handleRepo(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Repo info requested");
    const { owner, repo } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    const foundRepo = mockRepos.find((r) => r.full_name === `${owner}/${repo}`);
    if (!foundRepo) {
        return res.status(404).json({
            message: "Not Found",
        });
    }
    res.json(foundRepo);
}
// Get repository branches
function handleRepoBranches(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Repo branches requested");
    const { owner, repo } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    const foundRepo = mockRepos.find((r) => r.full_name === `${owner}/${repo}`);
    if (!foundRepo) {
        return res.status(404).json({
            message: "Not Found",
        });
    }
    res.json(mockBranches);
}
// Create repository for organization (not implemented in mock)
function handleOrgRepos(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Org repos requested");
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    // For simplicity, just redirect to user repos for mock
    handleUserRepos(req, res);
}
function handleRepoCollaborators(req, res) {
    (0, log_1.fakeLlmLog)("* GitHub Repo collaborators requested");
    const { owner, repo } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.includes(mockAccessToken)) {
        return res.status(401).json({
            message: "Bad credentials",
        });
    }
    const repoName = `${owner}/${repo}`;
    const foundRepo = mockRepos.find((r) => r.full_name === repoName);
    if (!foundRepo) {
        return res.status(404).json({
            message: "Not Found",
        });
    }
    if (req.method === "GET") {
        return res.json(repoCollaborators[repoName] || []);
    }
    if (req.method === "PUT") {
        const username = Array.isArray(req.params.username)
            ? req.params.username[0]
            : req.params.username;
        if (!username) {
            return res.status(400).json({ error: "Username is required" });
        }
        const collaborators = repoCollaborators[repoName] || [];
        const existing = collaborators.find((c) => c.login === username);
        if (!existing) {
            collaborators.push({
                login: username,
                avatar_url: `https://example.com/avatars/${username}.png`,
                permissions: { pull: true, push: true, admin: false },
            });
        }
        repoCollaborators[repoName] = collaborators;
        return res.status(201).json({ invitation: true });
    }
    if (req.method === "DELETE") {
        const username = req.params.username;
        repoCollaborators[repoName] = (repoCollaborators[repoName] || []).filter((c) => c.login !== username);
        return res.status(204).send();
    }
    return res.status(405).json({ message: "Method not allowed" });
}
// Push event management functions for testing
function handleGetPushEvents(req, res) {
    (0, log_1.fakeLlmLog)("* Getting push events");
    const { repo } = req.query;
    const events = repo ? pushEvents.filter((e) => e.repo === repo) : pushEvents;
    res.json(events);
}
function handleClearPushEvents(req, res) {
    (0, log_1.fakeLlmLog)("* Clearing push events");
    pushEvents.length = 0;
    res.json({ cleared: true, timestamp: new Date() });
}
function handleResetRepos(req, res) {
    (0, log_1.fakeLlmLog)("* Resetting repos root");
    try {
        fs.rmSync(mockReposRoot, { recursive: true, force: true });
    }
    catch (err) {
        console.warn("* Warning: failed to remove old repos root", err);
    }
    mockReposRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dyad-git-mock-"));
    (0, log_1.fakeLlmLog)(`* New repos root: ${mockReposRoot}`);
    res.json({ reset: true, timestamp: new Date() });
}
// Handle Git operations (push, pull, clone, etc.) using git-http-mock-server
function handleGitPush(req, res, next) {
    (0, log_1.fakeLlmLog)("* GitHub Git operation requested:", req.method, req.url);
    // Log request headers to see git operation details
    (0, log_1.fakeLlmLog)("* Git Headers:", {
        "git-protocol": req.headers["git-protocol"],
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
    });
    (0, log_1.fakeLlmLog)(`* Using git repos directory: `);
    // Create git middleware instance for this request
    const gitHttpMiddleware = gitHttpMiddlewareFactory({
        root: mockReposRoot,
        route: "/github/git",
        glob: "*.git",
    });
    // Extract repo name from URL path like /github/git/testuser/test-repo.git
    // The middleware expects the repo name as the basename after the route
    const urlPath = req.url;
    const match = urlPath.match(/\/github\/git\/[^/]+\/([^/.]+)\.git/);
    const repoName = match?.[1];
    if (repoName) {
        (0, log_1.fakeLlmLog)(`* Git operation for repo: ${repoName}`);
        // Ensure the bare git repository exists for this repo
        const bareRepoPath = path.join(mockReposRoot, `${repoName}.git`);
        if (!fs.existsSync(bareRepoPath)) {
            (0, log_1.fakeLlmLog)(`* Creating bare git repository at: ${bareRepoPath}`);
            try {
                fs.mkdirSync(bareRepoPath, { recursive: true });
                const { execSync } = require("child_process");
                execSync(`git init --bare`, { cwd: bareRepoPath });
                // Most repos are created via the "create new repo" + sync flow, so they
                // must start out empty: the very first push from Dyad is a fresh,
                // fast-forward "create" of the default branch. Pre-seeding those repos
                // would make that push diverge (non-fast-forward) and fail.
                //
                // Only repos that are meant to already exist on GitHub (e.g. the
                // "existing-vite-app" fixture used by the import auto-upgrade test) get
                // seeded with an initial commit so they can be cloned/imported.
                if (repoName === "existing-vite-app") {
                    const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), "dyad-git-clone-"));
                    try {
                        execSync(`git clone "${bareRepoPath}" "${tmpClone}"`, {
                            stdio: "pipe",
                        });
                        fs.writeFileSync(path.join(tmpClone, "README.md"), `# ${repoName}\n`);
                        fs.writeFileSync(path.join(tmpClone, "package.json"), JSON.stringify({
                            name: "existing-vite-app",
                            version: "0.0.1",
                            private: true,
                            devDependencies: {
                                vite: "^5.0.0",
                                "@vitejs/plugin-react-swc": "^3.9.0",
                            },
                        }, null, 2) + "\n");
                        fs.writeFileSync(path.join(tmpClone, "vite.config.ts"), [
                            'import { defineConfig } from "vite";',
                            'import react from "@vitejs/plugin-react-swc";',
                            "",
                            "export default defineConfig(() => ({",
                            "  plugins: [react()],",
                            "}));",
                            "",
                        ].join("\n"));
                        execSync(`git add -A`, { cwd: tmpClone, stdio: "pipe" });
                        execSync(`git -c user.name=dyad -c user.email=dyad@example.com commit -m "initial commit"`, { cwd: tmpClone, stdio: "pipe" });
                        execSync(`git push origin HEAD:refs/heads/main`, {
                            cwd: tmpClone,
                            stdio: "pipe",
                        });
                        try {
                            execSync(`git --git-dir="${bareRepoPath}" symbolic-ref HEAD refs/heads/main`, { stdio: "pipe" });
                        }
                        catch (err) {
                            console.warn("* Warning: failed to set symbolic-ref HEAD on bare repo", err);
                        }
                    }
                    finally {
                        fs.rmSync(tmpClone, { recursive: true, force: true });
                    }
                }
                (0, log_1.fakeLlmLog)(`* Successfully created bare git repository: ${repoName}.git`);
            }
            catch (error) {
                console.error(`* Failed to create bare git repository:`, error);
                return res.status(500).json({
                    message: "Failed to initialize git repository",
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        // Handle pushes (git-receive-pack POST) ourselves against the REAL bare
        // repo. The git-http-mock-server middleware would run receive-pack against
        // a throwaway fixturez COPY of it, so pushes over HTTP would never update
        // the repo — later clones/pulls would see stale (usually empty) history.
        // Buffering the body also lets us parse push events without racing the
        // middleware's own `req.pipe(...)` for the stream.
        if (req.url.includes("/git-receive-pack") && req.method === "POST") {
            (0, log_1.fakeLlmLog)("* Git PUSH operation detected for repo:", repoName);
            const chunks = [];
            req.on("data", (chunk) => {
                chunks.push(Buffer.from(chunk));
            });
            req.on("end", () => {
                const rawBody = Buffer.concat(chunks);
                const recordedEvents = recordPushEvents(repoName, rawBody.toString("latin1"));
                const env = req.headers["git-protocol"]
                    ? {
                        ...process.env,
                        GIT_PROTOCOL: String(req.headers["git-protocol"]),
                    }
                    : process.env;
                res.setHeader("content-type", "application/x-git-receive-pack-result");
                const ps = (0, child_process_1.spawn)("git-receive-pack", ["--stateless-rpc", bareRepoPath], { env });
                ps.on("error", (error) => {
                    console.error("* git-receive-pack failed to spawn:", error);
                    if (!res.headersSent) {
                        res.status(500);
                    }
                    res.end();
                });
                // If the child exits before consuming its whole stdin (bad pack,
                // spawn race), the pending write EPIPEs; without a handler that's an
                // uncaught stream error that takes down the whole fake server.
                ps.stdin.on("error", (error) => {
                    console.error("* git-receive-pack stdin error:", error);
                });
                ps.stdin.write(rawBody);
                ps.stdin.end();
                ps.stdout.pipe(res);
                ps.on("close", (code) => {
                    if (code === 0) {
                        ensureBareRepoHeadTracksCreatedBranch(bareRepoPath, recordedEvents);
                    }
                });
                // Deliberately NOT killing the child on client disconnect: its input
                // is fully buffered above, so it always terminates on its own, and
                // killing receive-pack mid-ref-update is what would leave stale locks
                // in the bare repo.
                (0, log_1.fakeLlmLog)(`* [git-http-server] 200 POST    ${req.url} (persistent receive-pack)`);
            });
            return;
        }
        // Rewrite the URL to match what the middleware expects
        // Change /github/git/testuser/test-repo.git/... to /github/git/test-repo.git/...
        const rewrittenUrl = req.url.replace(/\/github\/git\/[^/]+\//, "/github/git/");
        req.url = rewrittenUrl;
        (0, log_1.fakeLlmLog)(`* Rewritten URL from ${urlPath} to ${rewrittenUrl}`);
    }
    // Use git-http-mock-server middleware to handle the actual git operations
    gitHttpMiddleware(req, res, next ||
        (() => {
            // Fallback if middleware doesn't handle the request
            (0, log_1.fakeLlmLog)(`* Git middleware did not handle request: ${req.method} ${req.url}`);
            res.status(404).json({
                message: "Git operation not supported",
                url: req.url,
                method: req.method,
            });
        }));
}
