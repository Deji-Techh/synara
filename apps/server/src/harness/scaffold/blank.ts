import * as fs from "node:fs";
import * as path from "node:path";
import { colorTokens, typeScale, componentRules, radius } from "../../design/tokens.ts";

export async function scaffoldBlank(root: string, appName = "MyBlankProject"): Promise<string[]> {
  const createdFiles: string[] = [];

  const dirs = [root, path.join(root, "src"), path.join(root, ".caide")];

  for (const d of dirs) {
    await fs.promises.mkdir(d, { recursive: true });
  }

  const write = async (relPath: string, content: string) => {
    const full = path.join(root, relPath);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, content, "utf-8");
    createdFiles.push(relPath);
  };

  // 1. README.md
  await write(
    "README.md",
    `# ${appName}\n\nBlank project workspace created with Caide pure harness.\n`,
  );

  // 2. src/index.ts
  await write(
    "src/index.ts",
    `export function main() {\n  console.log("Welcome to ${appName}");\n}\n`,
  );

  // 3. .caide files
  await write(
    ".caide/framework.json",
    JSON.stringify({ framework: "blank", appName, createdAt: Date.now() }, null, 2),
  );
  await write(
    ".caide/design-spec.json",
    JSON.stringify({ colorTokens, typeScale, componentRules, radius, spacingUnit: 4 }, null, 2),
  );
  await write(
    ".caide/motion-spec.json",
    JSON.stringify(
      {
        spring: { stiffness: 400, damping: 30 },
        durations: { micro: "150ms", standard: "220ms" },
      },
      null,
      2,
    ),
  );
  await write(
    ".caide/spec.md",
    `# Specification: ${appName}\n\n*Pending specification planning.*\n`,
  );

  // 4. .gitignore
  await write(".gitignore", `node_modules/\ndist/\n`);

  return createdFiles;
}
