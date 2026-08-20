import fs from "fs";

const file = "apps/server/src/agentGateway/prompts/local_agent_prompt.ts";
let content = fs.readFileSync(file, "utf-8");

content = content.replace(
  /use the `update_todos` tool to track your progress/g,
  "update the task list artifact to track your progress",
);
content = content.replace(
  /use `run_type_checks` to verify/g,
  "use your command execution tool to run type checks to verify",
);
content = content.replace(
  /Use `planning_questionnaire` to ask/g,
  "Use your interactive questioning tool to ask",
);
content = content.replace(/the your code search tool tool/g, "your code search tool");
content = content.replace(
  /Use `grep` and `code_search` search tools extensively/g,
  "Use your search tools extensively",
);
content = content.replace(/`code_search`/g, "your code search tool");
content = content.replace(/`planning_questionnaire`/g, "your interactive questioning tool");

fs.writeFileSync(file, content, "utf-8");
console.log("Fixed remaining hardcoded tool names in local_agent_prompt.ts");
