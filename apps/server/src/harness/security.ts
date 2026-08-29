// harness/security.ts — M16 Security review pass
// Checks hardcoded secrets, insecure storage, sanitization, exposed keys

import { executeTool } from "./tools";

export interface SecurityResult {
  readonly passed: string[];
  readonly failed: string[];
  readonly score: number;
}

// M16: Check for hardcoded secrets
async function checkHardcodedSecrets(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const patterns = ["password|secret|api_key|apikey|token|private_key"];
  for (const pattern of patterns) {
    const res = await executeTool("grep", { pattern }, projectDir);
    if (res.ok && res.result && !res.result.includes("No matches")) {
      // Filter out false positives (comments, type definitions)
      const lines = res.result.split("\n").filter((l) =>
        !l.includes("//") && !l.includes("type ") && !l.includes("interface ") && !l.includes("export")
      );
      if (lines.length > 0) {
        return { pass: false, detail: `Potential hardcoded secrets found: ${lines.length} lines` };
      }
    }
  }
  return { pass: true, detail: "No hardcoded secrets" };
}

// M16: Check for insecure local storage
async function checkInsecureStorage(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "localStorage|AsyncStorage|secureStore" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: true, detail: "No local storage usage" };
  }
  const lines = res.result.split("\n").filter(Boolean);
  const insecure = lines.filter((l) => l.includes("localStorage") && !l.includes("token"));
  if (insecure.length > 0) {
    return { pass: false, detail: `${insecure.length} localStorage usages (consider secure storage for sensitive data)` };
  }
  return { pass: true, detail: "Storage usage appears secure" };
}

// M16: Check for input sanitization
async function checkSanitization(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "sanitize|escape|validate|trim|parseInt" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: false, detail: "No sanitization patterns found" };
  }
  return { pass: true, detail: "Sanitization patterns present" };
}

// M16: Check for exposed keys in bundle
async function checkExposedKeys(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "EXPO_PUBLIC_|NEXT_PUBLIC_|REACT_APP_" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: true, detail: "No exposed env keys" };
  }
  const lines = res.result.split("\n").filter(Boolean);
  return { pass: false, detail: `${lines.length} exposed env keys in bundle` };
}

// M16: Run all security checks
export async function runSecurityPass(projectDir: string): Promise<SecurityResult> {
  const passed: string[] = [];
  const failed: string[] = [];

  const secrets = await checkHardcodedSecrets(projectDir);
  if (secrets.pass) passed.push(`Secrets: ${secrets.detail}`);
  else failed.push(`Secrets: ${secrets.detail}`);

  const storage = await checkInsecureStorage(projectDir);
  if (storage.pass) passed.push(`Storage: ${storage.detail}`);
  else failed.push(`Storage: ${storage.detail}`);

  const sanitization = await checkSanitization(projectDir);
  if (sanitization.pass) passed.push(`Sanitization: ${sanitization.detail}`);
  else failed.push(`Sanitization: ${sanitization.detail}`);

  const keys = await checkExposedKeys(projectDir);
  if (keys.pass) passed.push(`Exposed keys: ${keys.detail}`);
  else failed.push(`Exposed keys: ${keys.detail}`);

  const score = passed.length / (passed.length + failed.length);
  return { passed, failed, score };
}
