import { CaideError, CaideErrorKind, isCaideError } from "@/errors/caide_error";
import type { SandboxHostCallName } from "./capabilities";
import type { SandboxRunResult } from "./execution";

export interface SandboxWorkerInput {
  appPath: string;
  script: string;
  timeoutMs: number;
  persistFullOutput?: boolean;
}

export interface SandboxWorkerHostCall {
  name: SandboxHostCallName;
  path?: string;
}

export interface SerializedSandboxWorkerError {
  name?: string;
  message: string;
  kind?: CaideErrorKind;
  stack?: string;
}

export type SandboxWorkerMessage =
  | { type: "vmBudgetStart" }
  | { type: "vmBudgetPause" }
  | { type: "vmBudgetResume" }
  | { type: "hostCall"; hostCall: SandboxWorkerHostCall }
  | { type: "result"; result: SandboxRunResult }
  | { type: "error"; error: SerializedSandboxWorkerError };

export function serializeSandboxWorkerError(error: unknown): SerializedSandboxWorkerError {
  if (isCaideError(error)) {
    return {
      name: error.name,
      message: error.message,
      kind: error.kind,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}

function isCaideErrorKind(value: unknown): value is CaideErrorKind {
  return (
    typeof value === "string" && Object.values(CaideErrorKind).includes(value as CaideErrorKind)
  );
}

export function deserializeSandboxWorkerError(error: SerializedSandboxWorkerError): Error {
  if (isCaideErrorKind(error.kind)) {
    const caideError = new CaideError(error.message, error.kind);
    caideError.stack = error.stack;
    return caideError;
  }

  const genericError = new Error(error.message);
  genericError.name = error.name ?? genericError.name;
  genericError.stack = error.stack;
  return genericError;
}
