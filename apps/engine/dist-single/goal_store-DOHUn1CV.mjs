#!/usr/bin/env node
import { fileURLToPath as __cFL } from "node:url";
import * as __cDP from "node:path";
const __filename = __cFL(import.meta.url);
const __dirname = __cDP.dirname(__filename);

import { r as __exportAll } from "./chunk-CeepVFa8.mjs";
import { b as init_caide_error, t as getCaideAppPath, v as CaideError, y as CaideErrorKind } from "./paths-Cht_zAlA.mjs";
import { f as apps, i as generateCuteAppName, n as PersistedGoalStateSchema, o as db, w as eq } from "./goal_state-DoBtgEmD.mjs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";

//#region src/ipc/goal/goal_store.ts
var goal_store_exports = /* @__PURE__ */ __exportAll({
	cancelGoal: () => cancelGoal,
	cancelOpenRuns: () => cancelOpenRuns,
	claimRun: () => claimRun,
	createGoal: () => createGoal,
	createRun: () => createRun,
	editGoal: () => editGoal,
	ensureGoalTables: () => ensureGoalTables,
	finishPause: () => finishPause,
	finishRun: () => finishRun,
	forceGoalStateActive: () => forceGoalStateActive,
	getActiveGoal: () => getActiveGoal,
	getGoal: () => getGoal,
	getGoalRowForScheduler: () => getGoalRowForScheduler,
	getGoalStatePath: () => getGoalStatePath,
	hasCurrentVerificationApproval: () => hasCurrentVerificationApproval,
	hasOpenRun: () => hasOpenRun,
	heartbeatRun: () => heartbeatRun,
	listActivity: () => listActivity,
	listGoals: () => listGoals,
	listRunnableRuns: () => listRunnableRuns,
	listRuns: () => listRuns,
	listSchedulableGoalRows: () => listSchedulableGoalRows,
	pauseGoal: () => pauseGoal,
	recordVerificationApproval: () => recordVerificationApproval,
	recoverExpiredRuns: () => recoverExpiredRuns,
	resumeGoal: () => resumeGoal,
	setRunWaiting: () => setRunWaiting,
	steerGoal: () => steerGoal,
	syncGoalFromState: () => syncGoalFromState,
	updateGoalStatus: () => updateGoalStatus
});
init_caide_error();
const LIVE_GOAL_STATUSES = [
	"draft",
	"active",
	"running",
	"pausing",
	"paused",
	"verifying",
	"repairing",
	"blocked",
	"awaiting-user"
];
const DEFAULT_DEFINITION_OF_DONE = [
	"The specified objective is implemented end-to-end without placeholder behaviour.",
	"The production build and type checks pass on the latest source revision.",
	"Required automated tests and the primary user flow pass.",
	"No unresolved critical or major quality, accessibility, security, or runtime defects remain.",
	"Deployment or packaging requirements named by the objective are verified healthy."
];
function sqlite() {
	return db.$client;
}
function ensureGoalTables() {
	sqlite().exec(`
    CREATE TABLE IF NOT EXISTS caide_goals (
      id TEXT PRIMARY KEY,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      originating_chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
      goal_chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      definition_of_done_json TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_target TEXT NOT NULL DEFAULT 'local',
      current_phase TEXT,
      current_task TEXT,
      blocker_json TEXT,
      next_retry_at INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      activated_at INTEGER,
      completed_at INTEGER,
      cancelled_at INTEGER,
      last_heartbeat_at INTEGER,
      state_revision INTEGER NOT NULL DEFAULT 0,
      state_hash TEXT,
      state_json TEXT
    );
    CREATE INDEX IF NOT EXISTS caide_goals_app_idx
      ON caide_goals(app_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS caide_goals_one_live_per_app
      ON caide_goals(app_id)
      WHERE status NOT IN ('completed', 'cancelled');

    CREATE TABLE IF NOT EXISTS caide_goal_events (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES caide_goals(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS caide_goal_events_goal_idx
      ON caide_goal_events(goal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS caide_goal_runs (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES caide_goals(id) ON DELETE CASCADE,
      app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      runner_id TEXT,
      lease_expires_at INTEGER,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS caide_goal_runs_runnable_idx
      ON caide_goal_runs(status, lease_expires_at, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS caide_goal_runs_one_open_per_goal
      ON caide_goal_runs(goal_id)
      WHERE status IN ('pending', 'claimed', 'running');
  `);
	if (!sqlite().prepare("PRAGMA table_info(caide_goals)").all().some((column) => column.name === "state_json")) sqlite().exec("ALTER TABLE caide_goals ADD COLUMN state_json TEXT");
}
function parseJson(value, fallback) {
	if (!value) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}
function hashState(state) {
	return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}
async function resolveAppPath(appId) {
	const app = await db.query.apps.findFirst({ where: eq(apps.id, appId) });
	if (!app) throw new CaideError(`App not found: ${appId}`, CaideErrorKind.NotFound);
	return getCaideAppPath(app.path);
}
async function resolveCommonGitDirectory(gitDirectory) {
	try {
		const commonDirectory = (await fs.promises.readFile(path.join(gitDirectory, "commondir"), "utf8")).trim();
		return commonDirectory ? path.resolve(gitDirectory, commonDirectory) : gitDirectory;
	} catch {
		return gitDirectory;
	}
}
async function resolveGitDirectory(appPath) {
	const dotGit = path.join(appPath, ".git");
	try {
		const stat = await fs.promises.stat(dotGit);
		if (stat.isDirectory()) return resolveCommonGitDirectory(dotGit);
		if (!stat.isFile()) return null;
		const marker = (await fs.promises.readFile(dotGit, "utf8")).trim();
		if (!marker.toLowerCase().startsWith("gitdir:")) return null;
		const gitDir = marker.slice(marker.indexOf(":") + 1).trim();
		return resolveCommonGitDirectory(path.resolve(appPath, gitDir));
	} catch {
		return null;
	}
}
async function ensureGoalStateExcludedFromGit(appPath) {
	const gitDirectory = await resolveGitDirectory(appPath);
	if (!gitDirectory) return;
	const excludePath = path.join(gitDirectory, "info", "exclude");
	await fs.promises.mkdir(path.dirname(excludePath), { recursive: true });
	let current = "";
	try {
		current = await fs.promises.readFile(excludePath, "utf8");
	} catch {}
	const missingRules = ["/.caide/goals/", "/.caide/goals/"].filter((rule) => !current.split(/\r?\n/).some((line) => line.trim() === rule));
	if (missingRules.length === 0) return;
	const prefix = current && !current.endsWith("\n") ? "\n" : "";
	await fs.promises.appendFile(excludePath, `${prefix}# CAIDE durable goal controller state\n${missingRules.join("\n")}\n`);
}
async function getGoalStatePath(goal) {
	const appPath = await resolveAppPath(goal.app_id);
	const caidePath = path.join(appPath, ".caide", "goals", goal.id, "state.json");
	const legacyPath = path.join(appPath, ".caide", "goals", goal.id, "state.json");
	if (!fs.existsSync(caidePath) && fs.existsSync(legacyPath)) return legacyPath;
	return caidePath;
}
function parseStateForRow(row, value) {
	const state = PersistedGoalStateSchema.parse(value);
	if (state.goalId !== row.id) throw new CaideError("Persisted goal state belongs to a different goal.", CaideErrorKind.Validation);
	if (state.objective !== row.objective) throw new CaideError("Persisted goal state objective does not match the controller contract.", CaideErrorKind.Validation);
	return state;
}
async function readState(row) {
	const statePath = await getGoalStatePath(row);
	try {
		return parseStateForRow(row, JSON.parse(await fs.promises.readFile(statePath, "utf8")));
	} catch {
		if (!row.state_json) return null;
		try {
			const recovered = parseStateForRow(row, JSON.parse(row.state_json));
			await writeState(row, recovered);
			appendEvent(row.id, "state-recovered", "Recovered goal state from the durable controller backup");
			return recovered;
		} catch {
			return null;
		}
	}
}
async function writeState(row, state) {
	const appPath = await resolveAppPath(row.app_id);
	await ensureGoalStateExcludedFromGit(appPath);
	const statePath = path.join(appPath, ".caide", "goals", row.id, "state.json");
	await fs.promises.mkdir(path.dirname(statePath), { recursive: true });
	const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
	const serialized = JSON.stringify(state);
	sqlite().prepare("UPDATE caide_goals SET state_json = ?, state_hash = ? WHERE id = ?").run(serialized, hashState(state), row.id);
	await fs.promises.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
	await fs.promises.rename(tempPath, statePath);
}
function stateTasks(row, state) {
	return (state?.tasks ?? []).map((task) => ({
		...task,
		goalId: row.id,
		createdAt: row.created_at,
		updatedAt: state?.updatedAt ?? row.updated_at
	}));
}
function stateEvidence(row, state) {
	return (state?.evidence ?? []).map((evidence) => ({
		...evidence,
		goalId: row.id
	}));
}
async function hydrateGoal(row) {
	const state = await readState(row);
	const tasks = stateTasks(row, state);
	const evidence = stateEvidence(row, state);
	return {
		id: row.id,
		appId: row.app_id,
		originatingChatId: row.originating_chat_id,
		goalChatId: row.goal_chat_id,
		title: row.title,
		objective: row.objective,
		definitionOfDone: parseJson(row.definition_of_done_json, []),
		constraints: parseJson(row.constraints_json, []),
		status: row.status,
		executionTarget: row.execution_target,
		currentPhase: state?.currentPhase ?? row.current_phase,
		currentTask: state?.currentTask ?? row.current_task,
		blocker: state?.blocker ?? parseJson(row.blocker_json, null),
		nextRetryAt: row.next_retry_at,
		consecutiveFailures: row.consecutive_failures,
		verifiedTaskCount: tasks.filter((task) => task.status === "verified").length,
		totalTaskCount: tasks.filter((task) => task.required).length,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		activatedAt: row.activated_at,
		completedAt: row.completed_at,
		cancelledAt: row.cancelled_at,
		lastHeartbeatAt: row.last_heartbeat_at,
		stateRevision: row.state_revision,
		tasks,
		evidence
	};
}
function rowById(goalId) {
	const row = sqlite().prepare("SELECT * FROM caide_goals WHERE id = ?").get(goalId);
	if (!row) throw new CaideError(`Goal not found: ${goalId}`, CaideErrorKind.NotFound);
	return row;
}
function appendEvent(goalId, type, summary, metadata = {}) {
	sqlite().prepare(`INSERT INTO caide_goal_events
       (id, goal_id, type, summary, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), goalId, type, summary, JSON.stringify(metadata), Date.now());
}
function createGoalChat(appId, title) {
	const result = sqlite().prepare(`INSERT INTO chats (app_id, title, chat_mode)
       VALUES (?, ?, 'local-agent')`).run(appId, `[Goal] ${title}`);
	return Number(result.lastInsertRowid);
}
function initialState(id, objective, definitionOfDone) {
	const now = Date.now();
	return {
		version: 1,
		goalId: id,
		objective,
		status: "active",
		currentPhase: "Planning and repository assessment",
		currentTask: "Convert the objective into an executable task graph",
		tasks: [
			{
				id: "plan-objective",
				title: "Plan the objective",
				description: "Inspect the current project and create a dependency-aware implementation plan.",
				status: "ready",
				order: 0,
				required: true,
				dependencies: [],
				completionCriteria: ["The task graph covers the full objective and definition of done."],
				verificationMethod: "Review the persisted goal task graph."
			},
			{
				id: "implement-objective",
				title: "Implement the complete objective",
				description: "Implement every required feature and integration without placeholders.",
				status: "pending",
				order: 1,
				required: true,
				dependencies: ["plan-objective"],
				completionCriteria: definitionOfDone,
				verificationMethod: "Inspect source changes and execute relevant tests."
			},
			{
				id: "production-verification",
				title: "Verify production readiness",
				description: "Run builds, tests, audits, security checks and deployment or packaging verification required by the objective.",
				status: "pending",
				order: 2,
				required: true,
				dependencies: ["implement-objective"],
				completionCriteria: definitionOfDone,
				verificationMethod: "Independent verification against the latest source revision."
			}
		],
		evidence: [],
		steering: [],
		blocker: null,
		verification: {
			passed: false,
			checkedAt: null,
			revision: null,
			criteria: definitionOfDone.map((criterion) => ({
				criterion,
				passed: false,
				evidence: []
			}))
		},
		updatedAt: now
	};
}
async function createGoal(input) {
	ensureGoalTables();
	let effectiveAppId = input.appId;
	if (!effectiveAppId || effectiveAppId <= 0) {
		const latestApp = await db.query.apps.findFirst({ orderBy: (apps, { desc }) => [desc(apps.createdAt)] });
		if (latestApp) effectiveAppId = latestApp.id;
		else {
			const name = generateCuteAppName();
			const fullAppPath = getCaideAppPath(name);
			await fs.promises.mkdir(fullAppPath, { recursive: true });
			const [created] = await db.insert(apps).values({
				name,
				path: name,
				needsAppBlueprint: false
			}).returning();
			effectiveAppId = created.id;
		}
	}
	const objective = input.objective.trim();
	const requestedDefinition = input.definitionOfDone?.filter(Boolean) ?? [];
	const definitionOfDone = requestedDefinition.length ? requestedDefinition : DEFAULT_DEFINITION_OF_DONE;
	const constraints = input.constraints?.filter(Boolean) ?? [];
	const title = input.title?.trim() || objective.split(/\r?\n/)[0].slice(0, 100).trim();
	const id = randomUUID();
	const now = Date.now();
	const goalChatId = createGoalChat(effectiveAppId, title);
	try {
		sqlite().prepare(`INSERT INTO caide_goals (
          id, app_id, originating_chat_id, goal_chat_id, title, objective,
          definition_of_done_json, constraints_json, status, execution_target,
          current_phase, current_task, consecutive_failures, created_at,
          updated_at, activated_at, state_revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 0, ?, ?, ?, 0)`).run(id, effectiveAppId, input.chatId ?? null, goalChatId, title, objective, JSON.stringify(definitionOfDone), JSON.stringify(constraints), input.executionTarget ?? "local", "Planning and repository assessment", "Convert the objective into an executable task graph", now, now, now);
		await writeState(rowById(id), initialState(id, objective, definitionOfDone));
	} catch (error) {
		sqlite().prepare("DELETE FROM caide_goals WHERE id = ?").run(id);
		sqlite().prepare("DELETE FROM chats WHERE id = ?").run(goalChatId);
		throw error;
	}
	appendEvent(id, "created", "Goal created and activated", { executionTarget: input.executionTarget ?? "local" });
	return hydrateGoal(rowById(id));
}
async function getGoal(goalId) {
	ensureGoalTables();
	return hydrateGoal(rowById(goalId));
}
async function getActiveGoal(appId) {
	ensureGoalTables();
	const placeholders = LIVE_GOAL_STATUSES.map(() => "?").join(",");
	const query = appId && appId > 0 ? `SELECT * FROM caide_goals
         WHERE app_id = ? AND status IN (${placeholders})
         ORDER BY updated_at DESC LIMIT 1` : `SELECT * FROM caide_goals
         WHERE status IN (${placeholders})
         ORDER BY updated_at DESC LIMIT 1`;
	const args = appId && appId > 0 ? [appId, ...LIVE_GOAL_STATUSES] : [...LIVE_GOAL_STATUSES];
	const row = sqlite().prepare(query).get(...args);
	return row ? hydrateGoal(row) : null;
}
async function listGoals(input) {
	ensureGoalTables();
	const where = [];
	const args = [];
	if (input.appId !== void 0) {
		where.push("app_id = ?");
		args.push(input.appId);
	}
	if (input.statuses?.length) {
		where.push(`status IN (${input.statuses.map(() => "?").join(",")})`);
		args.push(...input.statuses);
	}
	const rows = sqlite().prepare(`SELECT * FROM caide_goals ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY updated_at DESC`).all(...args);
	return Promise.all(rows.map(hydrateGoal));
}
async function updateGoalStatus(goalId, status, options = {}) {
	const row = rowById(goalId);
	if (row.status === "cancelled" || row.status === "completed") throw new CaideError(`Cannot change a ${row.status} goal.`, CaideErrorKind.Validation);
	const now = Date.now();
	const completedAt = status === "completed" ? now : null;
	const cancelledAt = status === "cancelled" ? now : null;
	const failureSql = options.incrementFailure ? "consecutive_failures + 1" : options.resetFailures ? "0" : "consecutive_failures";
	sqlite().prepare(`UPDATE caide_goals SET
       status = ?, blocker_json = ?, next_retry_at = ?,
       consecutive_failures = ${failureSql}, updated_at = ?,
       completed_at = COALESCE(?, completed_at),
       cancelled_at = COALESCE(?, cancelled_at)
       WHERE id = ?`).run(status, options.blocker ? JSON.stringify(options.blocker) : null, options.nextRetryAt ?? null, now, completedAt, cancelledAt, goalId);
	appendEvent(goalId, status, options.reason ?? `Goal status changed to ${status}`);
	if (status === "completed" || status === "cancelled") cleanupGoalStateFile(rowById(goalId)).catch(() => {});
	return hydrateGoal(rowById(goalId));
}
async function pauseGoal(goalId, reason) {
	return updateGoalStatus(goalId, "pausing", { reason: reason ?? "Pause requested" });
}
async function finishPause(goalId) {
	return updateGoalStatus(goalId, "paused", { reason: "Goal checkpointed and paused" });
}
async function resumeGoal(goalId) {
	const row = rowById(goalId);
	if (row.status !== "paused" && row.status !== "blocked" && row.status !== "awaiting-user") throw new CaideError(`Goal cannot resume from ${row.status}.`, CaideErrorKind.Validation);
	await forceGoalStateActive(goalId);
	return updateGoalStatus(goalId, "active", {
		reason: "Goal resumed",
		resetFailures: true
	});
}
async function cleanupGoalStateFile(goal) {
	try {
		const appPath = await resolveAppPath(goal.app_id);
		const stateDir = path.join(appPath, ".caide", "goals", goal.id);
		await fs.promises.rm(stateDir, {
			recursive: true,
			force: true
		});
	} catch {}
}
async function cancelGoal(goalId, reason) {
	return updateGoalStatus(goalId, "cancelled", { reason: reason ?? "Goal cancelled by user" });
}
async function editGoal(goalId, updates) {
	const row = rowById(goalId);
	const nextObjective = updates.objective ?? row.objective;
	const nextDefinition = updates.definitionOfDone ?? parseJson(row.definition_of_done_json, []);
	sqlite().prepare(`UPDATE caide_goals SET title = ?, objective = ?, definition_of_done_json = ?,
       constraints_json = ?, execution_target = ?, updated_at = ? WHERE id = ?`).run(updates.title ?? row.title, nextObjective, JSON.stringify(nextDefinition), JSON.stringify(updates.constraints ?? parseJson(row.constraints_json, [])), updates.executionTarget ?? row.execution_target, Date.now(), goalId);
	const state = await readState(row);
	if (state) {
		state.objective = nextObjective;
		state.verification.passed = false;
		state.verification.checkedAt = null;
		state.verification.criteria = nextDefinition.map((criterion) => ({
			criterion,
			passed: false,
			evidence: []
		}));
		state.status = "active";
		state.steering = [...state.steering, {
			instruction: "The goal contract was edited. Reconcile the task graph and invalidate stale assumptions before continuing.",
			createdAt: Date.now()
		}].slice(-100);
		state.updatedAt = Date.now();
		await writeState({
			...row,
			objective: nextObjective
		}, state);
	}
	appendEvent(goalId, "edited", "Goal contract edited", updates);
	return hydrateGoal(rowById(goalId));
}
async function steerGoal(goalId, instruction) {
	const row = rowById(goalId);
	if (["completed", "cancelled"].includes(row.status)) throw new CaideError(`Cannot steer a ${row.status} goal.`, CaideErrorKind.Validation);
	const state = await readState(row);
	if (state) {
		state.steering = [...state.steering, {
			instruction,
			createdAt: Date.now()
		}].slice(-100);
		state.status = "active";
		state.blocker = null;
		state.verification.passed = false;
		state.verification.checkedAt = null;
		state.updatedAt = Date.now();
		await writeState(row, state);
	}
	appendEvent(goalId, "steered", instruction, { instruction });
	sqlite().prepare(`UPDATE caide_goals SET
       status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'active' END,
       blocker_json = NULL, next_retry_at = NULL, updated_at = ? WHERE id = ?`).run(Date.now(), goalId);
	return hydrateGoal(rowById(goalId));
}
function listActivity(goalId, limit = 200) {
	ensureGoalTables();
	return sqlite().prepare(`SELECT * FROM caide_goal_events WHERE goal_id = ?
         ORDER BY created_at DESC LIMIT ?`).all(goalId, limit).map((row) => ({
		id: row.id,
		goalId: row.goal_id,
		type: row.type,
		summary: row.summary,
		metadata: parseJson(row.metadata_json, {}),
		createdAt: row.created_at
	}));
}
function runFromRow(row) {
	return {
		id: row.id,
		goalId: row.goal_id,
		appId: row.app_id,
		chatId: row.chat_id,
		kind: row.kind,
		status: row.status,
		prompt: row.prompt,
		attempt: row.attempt,
		runnerId: row.runner_id,
		leaseExpiresAt: row.lease_expires_at,
		createdAt: row.created_at,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
		error: row.error
	};
}
/** All runs for a goal, newest first (drives the web runs timeline). */
function listRuns(goalId, limit = 50) {
	ensureGoalTables();
	return sqlite().prepare(`SELECT * FROM caide_goal_runs WHERE goal_id = ?
         ORDER BY created_at DESC LIMIT ?`).all(goalId, limit).map(runFromRow);
}
function createRun(goalId, kind, prompt) {
	const goal = rowById(goalId);
	if (!goal.goal_chat_id) throw new CaideError("Goal has no execution chat.", CaideErrorKind.Precondition);
	if (sqlite().prepare(`SELECT * FROM caide_goal_runs WHERE goal_id = ?
       AND status IN ('pending', 'claimed', 'running') LIMIT 1`).get(goalId)) return null;
	const attemptRow = sqlite().prepare("SELECT COALESCE(MAX(attempt), 0) AS value FROM caide_goal_runs WHERE goal_id = ?").get(goalId);
	const id = randomUUID();
	const now = Date.now();
	sqlite().prepare(`INSERT INTO caide_goal_runs
       (id, goal_id, app_id, chat_id, kind, status, prompt, attempt, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(id, goalId, goal.app_id, goal.goal_chat_id, kind, prompt, Number(attemptRow.value) + 1, now);
	appendEvent(goalId, "run-created", `${kind} run queued`, { runId: id });
	return runFromRow(sqlite().prepare("SELECT * FROM caide_goal_runs WHERE id = ?").get(id));
}
function cancelOpenRuns(goalId, reason) {
	ensureGoalTables();
	const result = sqlite().prepare(`UPDATE caide_goal_runs SET status = 'cancelled', finished_at = ?,
       lease_expires_at = NULL, error = ?
       WHERE goal_id = ? AND status IN ('pending', 'claimed', 'running')`).run(Date.now(), reason, goalId);
	if (result.changes) appendEvent(goalId, "runs-cancelled", reason, { count: result.changes });
	return result.changes;
}
function recoverExpiredRuns(now = Date.now()) {
	ensureGoalTables();
	const result = sqlite().prepare(`UPDATE caide_goal_runs SET status = 'pending', runner_id = NULL,
       lease_expires_at = NULL, started_at = NULL
       WHERE status IN ('claimed', 'running')
       AND (lease_expires_at IS NULL OR lease_expires_at < ?)`).run(now);
	if (result.changes) sqlite().prepare(`UPDATE caide_goals SET status = 'active', blocker_json = NULL,
         next_retry_at = NULL, updated_at = ?
         WHERE status = 'awaiting-user'
         AND blocker_json LIKE '%Tool approval required for active goal run%'`).run(now);
	return result.changes;
}
function hasOpenRun(goalId) {
	ensureGoalTables();
	const row = sqlite().prepare(`SELECT 1 AS value FROM caide_goal_runs
       WHERE goal_id = ? AND status IN ('pending', 'claimed', 'running') LIMIT 1`).get(goalId);
	return Boolean(row);
}
function listRunnableRuns(limit = 10) {
	recoverExpiredRuns();
	return sqlite().prepare(`SELECT r.* FROM caide_goal_runs r
         JOIN caide_goals g ON g.id = r.goal_id
         WHERE r.status = 'pending'
         AND g.status IN ('active', 'running', 'repairing', 'verifying')
         ORDER BY r.created_at ASC LIMIT ?`).all(limit).map(runFromRow);
}
function claimRun(runId, runnerId, leaseMs = 3e4) {
	const now = Date.now();
	if (!sqlite().prepare(`UPDATE caide_goal_runs SET status = 'running', runner_id = ?,
       lease_expires_at = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ? AND status = 'pending'`).run(runnerId, now + leaseMs, now, runId).changes) return null;
	const goalCheck = sqlite().prepare(`SELECT status FROM caide_goals WHERE id = (SELECT goal_id FROM caide_goal_runs WHERE id = ?)`).get(runId);
	if (goalCheck && (goalCheck.status === "cancelled" || goalCheck.status === "completed")) {
		sqlite().prepare(`UPDATE caide_goal_runs SET status = 'cancelled', finished_at = ?
         WHERE id = ?`).run(now, runId);
		return null;
	}
	const row = sqlite().prepare("SELECT * FROM caide_goal_runs WHERE id = ?").get(runId);
	sqlite().prepare("UPDATE caide_goals SET status = ?, last_heartbeat_at = ?, updated_at = ? WHERE id = ?").run(row.kind === "verify" ? "verifying" : row.kind === "repair" ? "repairing" : "running", now, now, row.goal_id);
	appendEvent(row.goal_id, "run-started", `${row.kind} run started`, {
		runId,
		runnerId
	});
	return runFromRow(row);
}
function heartbeatRun(runId, runnerId, leaseMs = 3e4) {
	const now = Date.now();
	const row = sqlite().prepare("SELECT goal_id FROM caide_goal_runs WHERE id = ?").get(runId);
	if (!row) return false;
	const result = sqlite().prepare(`UPDATE caide_goal_runs SET lease_expires_at = ?
       WHERE id = ? AND runner_id = ? AND status = 'running'`).run(now + leaseMs, runId, runnerId);
	if (result.changes) sqlite().prepare("UPDATE caide_goals SET last_heartbeat_at = ? WHERE id = ?").run(now, row.goal_id);
	return result.changes > 0;
}
async function setRunWaiting(input) {
	const run = sqlite().prepare(`SELECT * FROM caide_goal_runs
       WHERE id = ? AND runner_id = ? AND status = 'running'`).get(input.runId, input.runnerId);
	if (!run) throw new CaideError("Goal run lease is no longer valid.", CaideErrorKind.Validation);
	const now = Date.now();
	const nextStatus = input.waiting ? "awaiting-user" : run.kind === "verify" ? "verifying" : run.kind === "repair" ? "repairing" : "running";
	const blocker = input.waiting ? {
		reason: input.reason ?? "Tool approval required for active goal run. Open the goal chat to review it.",
		userAction: "Approve or decline the pending tool request in the goal chat.",
		retryable: false,
		detectedAt: now
	} : null;
	sqlite().prepare(`UPDATE caide_goals SET status = ?, blocker_json = ?, updated_at = ?
       WHERE id = ?`).run(nextStatus, blocker ? JSON.stringify(blocker) : null, now, run.goal_id);
	appendEvent(run.goal_id, input.waiting ? "awaiting-approval" : "approval-resolved", input.waiting ? blocker.reason : "Pending tool approval resolved; execution continued", { runId: run.id });
	return hydrateGoal(rowById(run.goal_id));
}
function finishRun(input) {
	const now = Date.now();
	const status = input.success ? "succeeded" : "failed";
	if (!sqlite().prepare(`UPDATE caide_goal_runs SET status = ?, finished_at = ?, error = ?,
       lease_expires_at = NULL WHERE id = ? AND runner_id = ? AND status = 'running'`).run(status, now, input.error ?? null, input.runId, input.runnerId).changes) throw new CaideError("Goal run lease is no longer valid.", CaideErrorKind.Validation);
	const row = sqlite().prepare("SELECT * FROM caide_goal_runs WHERE id = ?").get(input.runId);
	appendEvent(row.goal_id, input.success ? "run-succeeded" : "run-failed", `${row.kind} run ${status}`, {
		runId: input.runId,
		error: input.error
	});
	return runFromRow(row);
}
async function syncGoalFromState(goalId) {
	const row = rowById(goalId);
	const state = await readState(row);
	if (!state) return {
		goal: await hydrateGoal(row),
		state: null,
		changed: false
	};
	const nextHash = hashState(state);
	const changed = nextHash !== row.state_hash;
	const statusFromState = state.status === "blocked" ? "blocked" : state.status === "awaiting-user" ? "awaiting-user" : row.status;
	sqlite().prepare(`UPDATE caide_goals SET current_phase = ?, current_task = ?, blocker_json = ?,
       status = ?, state_hash = ?, state_json = ?,
       state_revision = state_revision + ?, updated_at = ? WHERE id = ?`).run(state.currentPhase, state.currentTask, state.blocker ? JSON.stringify(state.blocker) : null, statusFromState, nextHash, JSON.stringify(state), changed ? 1 : 0, Date.now(), goalId);
	return {
		goal: await hydrateGoal(rowById(goalId)),
		state,
		changed
	};
}
function recordVerificationApproval(goalId) {
	const row = rowById(goalId);
	if (!row.state_hash) throw new CaideError("Cannot approve verification without a persisted goal state.", CaideErrorKind.Precondition);
	appendEvent(goalId, "verification-approved", "Independent verification approved the current durable goal state", {
		stateHash: row.state_hash,
		stateRevision: row.state_revision
	});
}
function hasCurrentVerificationApproval(goalId) {
	const row = rowById(goalId);
	if (!row.state_hash) return false;
	return parseJson(sqlite().prepare(`SELECT metadata_json FROM caide_goal_events
       WHERE goal_id = ? AND type = 'verification-approved'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(goalId)?.metadata_json ?? null, {}).stateHash === row.state_hash;
}
async function forceGoalStateActive(goalId) {
	const row = rowById(goalId);
	const state = await readState(row);
	if (!state) return;
	if (state.status !== "completed") state.status = "active";
	state.blocker = null;
	state.updatedAt = Date.now();
	await writeState(row, state);
}
function getGoalRowForScheduler(goalId) {
	return rowById(goalId);
}
function listSchedulableGoalRows(now = Date.now()) {
	ensureGoalTables();
	return sqlite().prepare(`SELECT * FROM caide_goals
       WHERE (status IN ('active', 'running', 'repairing', 'verifying', 'pausing')
       OR (status = 'blocked' AND next_retry_at IS NOT NULL AND next_retry_at <= ?))
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY updated_at ASC`).all(now, now);
}

//#endregion
export { recordVerificationApproval as C, steerGoal as D, setRunWaiting as E, syncGoalFromState as O, pauseGoal as S, resumeGoal as T, listActivity as _, createRun as a, listRuns as b, finishPause as c, getGoal as d, getGoalRowForScheduler as f, heartbeatRun as g, hasOpenRun as h, createGoal as i, updateGoalStatus as k, forceGoalStateActive as l, hasCurrentVerificationApproval as m, cancelOpenRuns as n, editGoal as o, goal_store_exports as p, claimRun as r, ensureGoalTables as s, cancelGoal as t, getActiveGoal as u, listGoals as v, recoverExpiredRuns as w, listSchedulableGoalRows as x, listRunnableRuns as y };