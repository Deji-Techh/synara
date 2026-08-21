// FILE: remarkSpawnSubagentChip.test.ts
// Purpose: Tests for the remark plugin that rewrites the engine's
// <caide-spawn-subagent> inline marker into a chip element. Exercises the
// transformer directly on hand-built mdast trees (no unified dependency).
// Layer: Web chat presentation logic tests

import { describe, expect, it } from "vitest";

import { SPAWN_SUBAGENT_CHIP_TAG_NAME, remarkSpawnSubagentChip } from "./remarkSpawnSubagentChip";

interface TestNode {
  type: string;
  value?: string;
  children?: TestNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function run(tree: TestNode): TestNode {
  remarkSpawnSubagentChip()(tree);
  return tree;
}

function collectChips(node: TestNode, out: TestNode[] = []): TestNode[] {
  if (node.data?.hName === SPAWN_SUBAGENT_CHIP_TAG_NAME) {
    out.push(node);
  }
  for (const child of node.children ?? []) {
    collectChips(child, out);
  }
  return out;
}

function paragraph(children: TestNode[]): TestNode {
  return { type: "paragraph", children };
}

function text(value: string): TestNode {
  return { type: "text", value };
}

describe("remarkSpawnSubagentChip", () => {
  it("rewrites the spawn marker into a chip element carrying the role", () => {
    const tree = run(
      paragraph([
        text('<caide-spawn-subagent role="Database Expert">Spawning...</caide-spawn-subagent>'),
      ]),
    );
    const chips = collectChips(tree);
    expect(chips).toHaveLength(1);
    // At mdast level the hast attribute is camelCase ("dataRole"); remark-rehype
    // serializes it to the `data-role` DOM attribute the React component reads.
    expect(chips[0].data?.hProperties?.dataRole).toBe("Database Expert");
  });

  it("preserves surrounding text around the marker", () => {
    const tree = run(
      paragraph([
        text('Before <caide-spawn-subagent role="UI">Spawning...</caide-spawn-subagent> after'),
      ]),
    );
    const chips = collectChips(tree);
    expect(chips).toHaveLength(1);
    const texts = (tree.children ?? [])
      .filter((child) => child.type === "text")
      .map((child) => child.value);
    expect(texts).toEqual(["Before ", " after"]);
  });

  it("leaves ordinary text untouched", () => {
    const tree = run(paragraph([text("No markers here, just plain prose.")]));
    expect(collectChips(tree)).toHaveLength(0);
    expect(tree.children?.[0]?.value).toBe("No markers here, just plain prose.");
  });

  it("handles multiple markers in one text node", () => {
    const tree = run(
      paragraph([
        text(
          '<caide-spawn-subagent role="A">Spawning...</caide-spawn-subagent> and ' +
            '<caide-spawn-subagent role="B">Spawning...</caide-spawn-subagent>',
        ),
      ]),
    );
    expect(collectChips(tree)).toHaveLength(2);
  });
});
