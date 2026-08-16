import fs from "fs";

const file = "apps/server/src/agentGateway/prompts/local_agent_prompt.ts";
let content = fs.readFileSync(file, "utf-8");

// Replacements
content = content.replace(/read_file/g, "view_file");
content = content.replace(/write_file/g, "write_to_file");
content = content.replace(/list_files/g, "list_dir");
content = content.replace(/search_code/g, "grep_search");
// Some places mention "grep", we should replace it with "grep_search" carefully, usually it's in backticks or quotes
content = content.replace(/`grep`/g, "`grep_search`");
content = content.replace(/'grep'/g, "'grep_search'");
content = content.replace(/"grep"/g, '"grep_search"');

content = content.replace(/search_replace/g, "replace_file_content");
content = content.replace(/edit_file/g, "replace_file_content");
content = content.replace(/multi_replace/g, "multi_replace_file_content");

// Update explore_code guidance
const oldExploreCodeGuidance = `const CODE_EXPLORATION_GUIDANCE = \`For TypeScript, TSX, JavaScript, or JSX features, symbols, components, services, or flows included in the app's TypeScript config, use \\\`explore_code\\\` first; do not warm up with \\\`list_dir\\\`, \\\`grep_search\\\`, or \\\`view_file\\\` before it. Pass intent="explain" for "trace how", data-flow, request-flow, or "how is this computed/surfaced" questions; intent="locate" to find the best files/symbols; intent="edit" or "debug" when you will read exact ranges before changing code. Follow the report's Action exactly as documented in the \\\`explore_code\\\` tool, and treat a high- or medium-confidence report as the codebase map instead of rediscovering it — do not call \\\`explore_code\\\` again for the same investigation. Use \\\`grep_search\\\`, \\\`list_dir\\\`, and \\\`view_file\\\` manually only if \\\`explore_code\\\` is unavailable, fails, returns low confidence, or the relevant files are outside the TypeScript config.\`;`;
const newExploreCodeGuidance = `const CODE_EXPLORATION_GUIDANCE = \`For exploring the codebase, use \\\`grep_search\\\` to find patterns, keywords, or symbols, and use \\\`list_dir\\\` to understand the directory structure. Use \\\`view_file\\\` to read files based on your findings. Do not guess file paths without searching first.\`;`;
content = content.replace(oldExploreCodeGuidance, newExploreCodeGuidance);

// In case the exact explore_code guidance replacement fails due to formatting, let's also just replace explore_code globally
content = content.replace(/explore_code/g, "grep_search");

fs.writeFileSync(file, content, "utf-8");
console.log("Updated tools in local_agent_prompt.ts");
