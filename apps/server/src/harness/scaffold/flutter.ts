/**
 * Scaffold Flutter — Material per 004 M21.
 */
import { mkdirSync, writeFileSync } from "node:fs";
export function scaffoldFlutter(root: string): string[] {
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/pubspec.yaml`, `name: flutter_app\ndependencies:\n  flutter:\n    sdk: flutter\n`);
  writeFileSync(`${root}/.caide/framework.json`, JSON.stringify({ framework: "flutter" }, null, 2));
  return [`${root}/pubspec.yaml`];
}
