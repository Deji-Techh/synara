import { spawn } from "node:child_process";
import path from "node:path";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { Problem, ProblemReport } from "@/ipc/types";
import { getDartExecutable } from "@/ipc/utils/flutter_utils";
import log from "electron-log";

const logger = log.scope("flutter_analyze");
const FLUTTER_ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;

const MACHINE_LINE_PREFIX = /^(ERROR|WARNING|INFO)\|/;

/**
 * Run `dart analyze --format=machine` in a Flutter project and return the
 * raw machine-readable output. The machine format is stable across Dart
 * versions, unlike the human-readable console output.
 */
function runFlutterAnalyze(appPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const dart = getDartExecutable();
    let stdout = "";
    let stderr = "";
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(dart, ["analyze", "--format=machine"], {
        cwd: appPath,
        shell: false,
        stdio: "pipe",
        windowsHide: true,
      });
    } catch (error) {
      reject(
        new CaideError(
          `flutter analyze could not start: ${
            error instanceof Error ? error.message : String(error)
          }`,
          CaideErrorKind.External,
        ),
      );
      return;
    }

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => {
        logger.error(`flutter analyze timed out for ${appPath}`);
        reject(
          new CaideError(
            `flutter analyze timed out after ${FLUTTER_ANALYZE_TIMEOUT_MS / 1000}s`,
            CaideErrorKind.External,
          ),
        );
      });
      child.kill("SIGTERM");
    }, FLUTTER_ANALYZE_TIMEOUT_MS);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.once("error", (error) => {
      settle(() =>
        reject(
          new CaideError(
            `flutter analyze could not start: ${error.message}`,
            CaideErrorKind.External,
          ),
        ),
      );
    });
    child.once("close", (code) => {
      settle(() => {
        if (code === 0 || code === 1) {
          // Exit 0 = no issues, 1 = issues found. Both carry machine output.
          resolve(`${stdout}\n${stderr}`);
          return;
        }
        logger.error(`flutter analyze failed for ${appPath} (exit ${code}): ${stderr}`);
        reject(
          new CaideError(
            `flutter analyze failed (exit code ${code ?? "unknown"}).\n\n${[
              stdout.trim() ? `STDOUT:\n${stdout.trim()}` : "",
              stderr.trim() ? `STDERR:\n${stderr.trim()}` : "",
            ]
              .filter(Boolean)
              .join("\n\n")}`,
            CaideErrorKind.External,
          ),
        );
      });
    });
  });
}

function parseMachineProblems(output: string, appPath: string): Problem[] {
  const problems: Problem[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!MACHINE_LINE_PREFIX.test(line)) continue;
    // SEVERITY|errorType|code|file|line|column|length|message
    const [severity, errorType, code, file, lineNo, colNo, , ...rest] = line.split("|");
    void severity;
    void errorType;
    const message = rest.join("|");
    if (!file || !lineNo || !colNo) continue;
    const parsedCode = Number.parseInt(code ?? "", 10);
    const numericCode = Number.isNaN(parsedCode) ? 0 : parsedCode;
    const ruleName = !Number.isNaN(parsedCode) || !code ? "" : `${code}: `;
    problems.push({
      file: path.isAbsolute(file) ? path.relative(appPath, file) : file,
      line: Number.parseInt(lineNo, 10),
      column: Number.parseInt(colNo, 10),
      message: `${ruleName}${message}`.trim(),
      code: numericCode,
      snippet: "",
    });
  }
  return problems;
}

export async function generateFlutterProblemReport(appPath: string): Promise<ProblemReport> {
  const output = await runFlutterAnalyze(appPath);
  return { problems: parseMachineProblems(output, appPath) };
}
