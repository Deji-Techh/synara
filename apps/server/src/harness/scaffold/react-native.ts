/**
 * Scaffold RN — Expo per 004 M21.
 */
import { mkdirSync, writeFileSync } from "node:fs";
export function scaffoldRN(root: string): string[] {
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/package.json`, JSON.stringify({ name: "rn-app", dependencies: { expo: "*" } }, null, 2));
  writeFileSync(`${root}/.caide/framework.json`, JSON.stringify({ framework: "react-native" }, null, 2));
  return [`${root}/package.json`];
}
