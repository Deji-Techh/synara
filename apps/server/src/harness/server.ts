/**
 * Server wiring — mounts harness to HTTP+WS typed events.
 * Per 004 M8 streaming separate token(SSE) vs event(WS typed {token,tool_call,stage,checkpoint,artifact_updated}) + SIGTERM.
 */
import { CaideRunner } from "./turn/runner.ts";
import { streamProvider } from "./provider/apiAdapter.ts";

export function createHarnessServer(): { runner: CaideRunner; handleStream: typeof streamProvider } {
  const runner = new CaideRunner();
  return { runner, handleStream: streamProvider };
}
