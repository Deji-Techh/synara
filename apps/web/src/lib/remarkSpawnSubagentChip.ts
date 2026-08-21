// FILE: remarkSpawnSubagentChip.ts
// Purpose: Remark plugin that rewrites the engine's `<caide-spawn-subagent
// role="...">Spawning...</caide-spawn-subagent>` inline marker (emitted by the
// spawn_subagent tool's buildXml while the spawn is in flight) into a custom
// chip element, so the transcript shows a styled "spawning subagent" affordance
// instead of raw XML text.
// Layer: Web chat presentation logic
// Exports: SPAWN_SUBAGENT_CHIP_TAG_NAME, SPAWN_SUBAGENT_ROLE_ATTRIBUTE,
//          remarkSpawnSubagentChip

export const SPAWN_SUBAGENT_CHIP_TAG_NAME = "spawn-subagent-chip";
export const SPAWN_SUBAGENT_ROLE_ATTRIBUTE = "data-role";

const SPAWN_SUBAGENT_PATTERN =
  /<caide-spawn-subagent\s+role="([^"]*)">\s*Spawning\.\.\.\s*<\/caide-spawn-subagent>/g;

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
}

function chipNode(role: string): MdastNode {
  return {
    type: "spawnSubagentChip",
    data: {
      hName: SPAWN_SUBAGENT_CHIP_TAG_NAME,
      // hast property `dataRole` reaches the React component as `data-role`.
      hProperties: { dataRole: role },
    },
    children: [],
  } as unknown as MdastNode;
}

function rewriteTextNode(node: MdastNode): MdastNode[] | null {
  const value = node.value ?? "";
  SPAWN_SUBAGENT_PATTERN.lastIndex = 0;
  if (!SPAWN_SUBAGENT_PATTERN.test(value)) {
    return null;
  }
  SPAWN_SUBAGENT_PATTERN.lastIndex = 0;
  const out: MdastNode[] = [];
  let last = 0;
  for (const match of value.matchAll(SPAWN_SUBAGENT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) {
      out.push({ type: "text", value: value.slice(last, start) });
    }
    out.push(chipNode(match[1] ?? ""));
    last = start + match[0].length;
  }
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) });
  }
  return out;
}

/** Custom element renderer data for the chip; consumed via the components map. */
export function remarkSpawnSubagentChip() {
  return (tree: MdastNode) => {
    const visit = (node: MdastNode, parent: MdastNode | null, index: number | null): void => {
      if (node.type === "text" && parent && index !== null) {
        const replacement = rewriteTextNode(node);
        if (replacement) {
          parent.children?.splice(index, 1, ...replacement);
          return;
        }
      }
      node.children?.forEach((child, childIndex) => {
        visit(child, node, childIndex);
      });
    };
    tree.children?.forEach((child, childIndex) => {
      visit(child, tree, childIndex);
    });
  };
}
