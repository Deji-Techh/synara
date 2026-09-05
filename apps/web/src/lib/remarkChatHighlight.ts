// FILE: remarkChatHighlight.ts
// Purpose: Remark plugin that parses ==highlight== and <mark>...</mark> syntax into styled highlights
// Layer: Web chat presentation logic

export const CHAT_HIGHLIGHT_TAG_NAME = "mark";

const HIGHLIGHT_PATTERN = /==([^=\r\n]+?)==|<mark>(.*?)<\/mark>/gi;

interface MdastNode {
  type: string;
  value?: string;
  children?: MdastNode[];
  data?: Record<string, unknown>;
}

function highlightNode(content: string): MdastNode {
  return {
    type: "chatHighlight",
    data: {
      hName: CHAT_HIGHLIGHT_TAG_NAME,
      hProperties: { className: "chat-highlight" },
    },
    children: [{ type: "text", value: content }],
  } as unknown as MdastNode;
}

function rewriteTextNode(node: MdastNode): MdastNode[] | null {
  const value = node.value ?? "";
  HIGHLIGHT_PATTERN.lastIndex = 0;
  if (!HIGHLIGHT_PATTERN.test(value)) {
    return null;
  }
  HIGHLIGHT_PATTERN.lastIndex = 0;
  const out: MdastNode[] = [];
  let last = 0;
  for (const match of value.matchAll(HIGHLIGHT_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) {
      out.push({ type: "text", value: value.slice(last, start) });
    }
    const matchedText = match[1] ?? match[2] ?? "";
    out.push(highlightNode(matchedText));
    last = start + match[0].length;
  }
  if (last < value.length) {
    out.push({ type: "text", value: value.slice(last) });
  }
  return out;
}

function visitNodes(node: MdastNode): void {
  if (!node.children || !Array.isArray(node.children)) {
    return;
  }
  const nextChildren: MdastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      const rewritten = rewriteTextNode(child);
      if (rewritten) {
        nextChildren.push(...rewritten);
        continue;
      }
    } else {
      visitNodes(child);
    }
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

export function remarkChatHighlight() {
  return (tree: MdastNode) => {
    visitNodes(tree);
  };
}
