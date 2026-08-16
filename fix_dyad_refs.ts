import fs from "fs";

const file = "apps/server/src/agentGateway/prompts/local_agent_prompt.ts";
let content = fs.readFileSync(file, "utf-8");

content = content.replace(/DYAD_TEST_USER_EMAIL/g, "CAIDE_TEST_USER_EMAIL");
content = content.replace(/DYAD_TEST_USER_PASSWORD/g, "CAIDE_TEST_USER_PASSWORD");
content = content.replace(/DYAD_TEST_USER_\*/g, "CAIDE_TEST_USER_*");

fs.writeFileSync(file, content, "utf-8");
console.log("Fixed dyad refs");
