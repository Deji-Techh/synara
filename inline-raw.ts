import fs from "fs";
import path from "path";

const files = ["apps/server/src/agentGateway/prompts/mobile_ui_skill_pack.ts", "apps/server/src/agentGateway/prompts/web3_skill_pack.ts"];

for (const file of files) {
  let content = fs.readFileSync(file, "utf-8");
  const regex = /import (\w+) from "([^"]+)\?raw";/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1];
    const relPath = match[2];
    const absPath = path.resolve(path.dirname(file), relPath);
    let fileContent = fs.readFileSync(absPath, "utf-8");
    // Escape backticks and dollars
    fileContent = fileContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    content = content.replace(match[0], `const ${varName} = \`${fileContent}\`;`);
  }
  fs.writeFileSync(file, content, "utf-8");
  console.log(`Inlined ${file}`);
}
