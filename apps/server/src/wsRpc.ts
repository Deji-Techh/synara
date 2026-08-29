// wsRpc — pure Caide minimal shell (no dyad, no orchestration/provider god imports)
// Replaces 2.8k-line ts-nocheck interim that imported deleted harness.
// Pure Caide harness lives in apps/server/src/harness/* and is exposed via /api/harness/* HTTP routes (harness/streamEndpoint).
// This stub keeps the WS surface needed by apps/web/src/nativeApi and effectServer without pulling deleted harness.

import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { RpcGroup } from "effect/unstable/rpc";

export function canManageExternalMcp(_role: "owner" | "client"): boolean {
  return _role === "owner";
}

export const hasAdmittedWsFeatureRequest = (_method: string): boolean => false;

export const makeWsRpcLayer = () => Layer.empty;

export function authenticateRpcWebSocketUpgrade(_input: unknown): unknown {
  return null;
}

export function authorizeDeviceFrameWebSocketUpgrade(_input: unknown): unknown {
  return null;
}

export function makeWebsocketRpcRouteLayer<R>(_input: unknown): Layer.Layer<R, never, never> {
  return Layer.empty as unknown as Layer.Layer<R, never, never>;
}

export const makeWebsocketNegotiationRouteLayer = () => Layer.empty;

export const websocketRpcRouteLayer = Layer.empty;

// Keep the same export names that effectServer and wsProjectHandlers import so tsc stays green without ts-nocheck
export const WsFeatureRpcGroup = RpcGroup.make("wsFeature");
