import * as contracts from "./packages/contracts/dist/index.mjs";
for (const [k, v] of Object.entries(contracts)) {
  if (k.startsWith("Ws") && k.endsWith("Group")) {
    console.log(k, v ? "defined" : "undefined");
  }
}
