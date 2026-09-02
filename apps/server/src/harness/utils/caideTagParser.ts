export interface CaideFileTag {
  path: string;
  content: string;
  description?: string;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function unescapeXmlAttr(str: string): string {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

function unescapeXmlContent(str: string): string {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTagAliases(fullResponse: string): string {
  return fullResponse.replace(/<\/caide-/g, "</dyad-").replace(/<caide-/g, "<dyad-");
}

function parseCaideFileTags(fullResponse: string, tagName: string): CaideFileTag[] {
  const escapedTagName = escapeRegexLiteral(tagName);
  const tagRegex = new RegExp(`<${escapedTagName}([^>]*)>([\\s\\S]*?)</${escapedTagName}>`, "gi");
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;
  let match: RegExpExecArray | null;
  const tags: CaideFileTag[] = [];
  while ((match = tagRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1] ?? "";
    let content = unescapeXmlContent((match[2] ?? "").trim());
    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);
    if (pathMatch?.[1]) {
      const path = normalizePath(unescapeXmlAttr(pathMatch[1]));
      const description = descriptionMatch?.[1] ? unescapeXmlAttr(descriptionMatch[1]) : undefined;
      const contentLines = content.split("\n");
      if (contentLines[0]?.trim().startsWith("```")) contentLines.shift();
      if (contentLines[contentLines.length - 1]?.trim().startsWith("```")) contentLines.pop();
      content = contentLines.join("\n");
      tags.push({ path, content, description });
    }
  }
  return tags;
}

export function getCaideWriteTags(fullResponse: string): CaideFileTag[] {
  return parseCaideFileTags(normalizeTagAliases(fullResponse), "dyad-write");
}

export function getCaideRenameTags(fullResponse: string): Array<{ from: string; to: string }> {
  const normalized = normalizeTagAliases(fullResponse);
  const re = /<dyad-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/dyad-rename>/g;
  let m: RegExpExecArray | null;
  const out: Array<{ from: string; to: string }> = [];
  while ((m = re.exec(normalized)) !== null) {
    out.push({ from: normalizePath(unescapeXmlAttr(m[1] ?? "")), to: normalizePath(unescapeXmlAttr(m[2] ?? "")) });
  }
  return out;
}

export function getCaideDeleteTags(fullResponse: string): string[] {
  const normalized = normalizeTagAliases(fullResponse);
  const re = /<dyad-delete[^>]*path="([^"]+)"[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  const out: string[] = [];
  while ((m = re.exec(normalized)) !== null) {
    if (m[1]) out.push(normalizePath(unescapeXmlAttr(m[1])));
  }
  const re2 = /<dyad-delete[^>]*path="([^"]+)"[^>]*>([\s\S]*?)<\/dyad-delete>/gi;
  while ((m = re2.exec(normalized)) !== null) {
    if (m[1]) out.push(normalizePath(unescapeXmlAttr(m[1])));
  }
  return [...new Set(out)];
}

export function stripCaideTags(text: string): string {
  return text
    .replace(/<(?:caide|dyad)-write[^>]*>[\s\S]*?<\/(?:caide|dyad)-write>/gi, "")
    .replace(/<(?:caide|dyad)-rename[^>]*>[\s\S]*?<\/(?:caide|dyad)-rename>/gi, "")
    .replace(/<(?:caide|dyad)-delete[^>]*\/?>/gi, "")
    .replace(/<(?:caide|dyad)-delete[^>]*>[\s\S]*?<\/(?:caide|dyad)-delete>/gi, "")
    .replace(/\{\s*"path"\s*:\s*"[^"]*"\s*(?:,\s*"content"\s*:\s*"[^"]*"\s*)?\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
