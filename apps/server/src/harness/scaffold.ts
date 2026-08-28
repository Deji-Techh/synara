// harness/scaffold.ts — M2 framework scaffold handlers (pure Caide, no dyad)
// Each framework controls prompts/tools/preview/build — immutable per project

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectFramework } from "./framework";
import { FRAMEWORKS } from "./framework";
import { setFramework, assertTrustedWorkspace } from "./frameworkStore";

export async function scaffoldProject(input: { projectId: string; workspaceRoot: string; framework: ProjectFramework; name: string }): Promise<{ workspaceRoot: string; framework: ProjectFramework }> {
  const def = FRAMEWORKS[input.framework];
  if (!def) throw new Error(`Unknown framework: ${input.framework}`);
  assertTrustedWorkspace(input.projectId, input.workspaceRoot, input.workspaceRoot);
  setFramework(input.projectId, input.framework);

  await mkdir(input.workspaceRoot, { recursive: true });

  if (input.framework === "blank") {
    await writeFile(join(input.workspaceRoot, "README.md"), `# ${input.name}\n\nBlank Caide project — pick a framework-appropriate skill for your first slice.\n`);
    return { workspaceRoot: input.workspaceRoot, framework: input.framework };
  }

  if (input.framework === "website") {
    await writeFile(join(input.workspaceRoot, "package.json"), JSON.stringify({ name: input.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"), scripts: { dev: "vite", build: "vite build" } }, null, 2));
    return { workspaceRoot: input.workspaceRoot, framework: input.framework };
  }

  if (input.framework === "react-native") {
    await writeFile(join(input.workspaceRoot, "package.json"), JSON.stringify({ name: input.name, scripts: { start: "expo start", web: "expo start --web" } }, null, 2));
    return { workspaceRoot: input.workspaceRoot, framework: input.framework };
  }

  if (input.framework === "flutter") {
    await writeFile(join(input.workspaceRoot, "pubspec.yaml"), `name: ${input.name.toLowerCase().replace(/[^a-z0-9_]/g, "_")}\nflutter:\n  uses-material-design: true\n`);
    return { workspaceRoot: input.workspaceRoot, framework: input.framework };
  }

  throw new Error(`Unhandled framework: ${input.framework}`);
}
