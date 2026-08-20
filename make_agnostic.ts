import fs from "fs";

const file = "apps/server/src/agentGateway/prompts/local_agent_prompt.ts";
let content = fs.readFileSync(file, "utf-8");

// Remove hardcoded tool names and replace with agnostic descriptions
content = content.replace(/\\`view_file\\`/g, "your file viewing tool");
content = content.replace(/\\`write_to_file\\`/g, "your file writing tool");
content = content.replace(/\\`list_dir\\`/g, "your directory listing tool");
content = content.replace(/\\`grep_search\\`/g, "your code search tool");
content = content.replace(/\\`replace_file_content\\`/g, "your precise file editing tool");
content = content.replace(
  /\\`multi_replace_file_content\\`/g,
  "your multi-region file editing tool",
);
content = content.replace(/`grep_search`/g, "your code search tool");

content = content.replace(
  /Use your precise file editing tool for edits/g,
  "Use your available file editing tools for edits",
);

fs.writeFileSync(file, content, "utf-8");
console.log("Updated tools to be agnostic");
