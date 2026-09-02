/**
 * Permission policy chain — steal kimi-code PermissionPolicy + claude-code canUseTool.
 * Modes: yolo|manual|auto
 */
export type PermissionMode = "yolo" | "manual" | "auto";
export type PermissionResult = { behavior: "allow" | "deny" | "ask"; message?: string };

export type PermissionPolicy = (tool: string, input: unknown) => Promise<PermissionResult>;

export function createPermissionChain(
  mode: PermissionMode,
  policies: PermissionPolicy[],
): PermissionPolicy {
  return async (tool, input) => {
    if (mode === "yolo") return { behavior: "allow" };
    for (const policy of policies) {
      const result = await policy(tool, input);
      if (result.behavior !== "allow") return result;
    }
    return { behavior: "allow" };
  };
}
