import { readFileSync } from "fs";
const code = readFileSync("apps/server/dist/index.mjs", "utf8");
// RpcGroup.make takes args. Find where it crashes.
