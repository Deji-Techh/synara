import { normalizePath } from "../../../shared/normalizePath";
import { unescapeXmlAttr, unescapeXmlContent } from "../../../shared/xmlEscape";
import log from "electron-log";
import { SqlQuery } from "../../lib/schemas";

const logger = log.scope("caide_tag_parser");

interface CaideFileTag {
  path: string;
  content: string;
  description?: string;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Maps brand-facing `<caide-*>` tags to the parser's canonical `<caide-*>`
 * protocol tags. Both spellings are accepted everywhere in this parser, so
 * prompts and cached prompts remain readable during the caide→caide rebrand.
 */
function normalizeTagAliases(fullResponse: string): string {
  return fullResponse.replace(/<\/caide-/g, "</caide-").replace(/<caide-/g, "<caide-");
}

/**
 * Parse `<tagName path="..." description="...">content</tagName>` occurrences
 * into file tags. Shared by the identical `<caide-write>` and
 * `<caide-generate-test>` extraction: both carry a `path`/`description` and a
 * body with optional surrounding markdown fences.
 */
function parseCaideFileTags(fullResponse: string, tagName: string): CaideFileTag[] {
  const escapedTagName = escapeRegexLiteral(tagName);
  const tagRegex = new RegExp(`<${escapedTagName}([^>]*)>([\\s\\S]*?)</${escapedTagName}>`, "gi");
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: CaideFileTag[] = [];

  while ((match = tagRegex.exec(fullResponse)) !== null) {
    const attributesString = match[1];
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1] ? unescapeXmlAttr(descriptionMatch[1]) : undefined;

      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn(`Found <${tagName}> tag without a valid 'path' attribute:`, match[0]);
    }
  }
  return tags;
}

export function getCaideWriteTags(fullResponse: string): CaideFileTag[] {
  return parseCaideFileTags(normalizeTagAliases(fullResponse), "caide-write");
}

export function getCaideGenerateTestTags(fullResponse: string): CaideFileTag[] {
  return parseCaideFileTags(normalizeTagAliases(fullResponse), "caide-generate-test");
}

export function getCaideRenameTags(fullResponse: string): {
  from: string;
  to: string;
}[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideRenameRegex =
    /<caide-rename from="([^"]+)" to="([^"]+)"[^>]*>([\s\S]*?)<\/caide-rename>/g;
  let match;
  const tags: { from: string; to: string }[] = [];
  while ((match = caideRenameRegex.exec(normalized)) !== null) {
    tags.push({
      from: normalizePath(unescapeXmlAttr(match[1])),
      to: normalizePath(unescapeXmlAttr(match[2])),
    });
  }
  return tags;
}

export function getCaideCopyTags(fullResponse: string): {
  from: string;
  to: string;
  description?: string;
}[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideCopyRegex = /<caide-copy([^>]*?)(?:>([\s\S]*?)<\/caide-copy>|\/>)/gi;
  const fromRegex = /from="([^"]+)"/;
  const toRegex = /to="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { from: string; to: string; description?: string }[] = [];

  while ((match = caideCopyRegex.exec(normalized)) !== null) {
    const attrs = match[1];
    const fromMatch = fromRegex.exec(attrs);
    const toMatch = toRegex.exec(attrs);
    const descriptionMatch = descriptionRegex.exec(attrs);

    if (fromMatch?.[1] && toMatch?.[1]) {
      tags.push({
        from: normalizePath(unescapeXmlAttr(fromMatch[1])),
        to: normalizePath(unescapeXmlAttr(toMatch[1])),
        description: descriptionMatch?.[1] ? unescapeXmlAttr(descriptionMatch[1]) : undefined,
      });
    } else {
      logger.warn("Found <caide-copy> tag without valid 'from' or 'to' attributes:", match[0]);
    }
  }
  return tags;
}

export function getCaideDeleteTags(fullResponse: string): string[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideDeleteRegex = /<caide-delete path="([^"]+)"[^>]*>([\s\S]*?)<\/caide-delete>/g;
  let match;
  const paths: string[] = [];
  while ((match = caideDeleteRegex.exec(normalized)) !== null) {
    paths.push(normalizePath(unescapeXmlAttr(match[1])));
  }
  return paths;
}

export function getCaideAddDependencyTags(fullResponse: string): string[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideAddDependencyRegex =
    /<caide-add-dependency packages="([^"]+)">[^<]*<\/caide-add-dependency>/g;
  let match;
  const packages: string[] = [];
  while ((match = caideAddDependencyRegex.exec(normalized)) !== null) {
    packages.push(...unescapeXmlAttr(match[1]).split(" "));
  }
  return packages;
}

export function getCaideChatSummaryTag(fullResponse: string): string | null {
  const normalized = normalizeTagAliases(fullResponse);
  const caideChatSummaryRegex = /<caide-chat-summary>([\s\S]*?)<\/caide-chat-summary>/g;
  const match = caideChatSummaryRegex.exec(normalized);
  if (match && match[1]) {
    return unescapeXmlContent(match[1].trim());
  }
  return null;
}

export function getCaideExecuteSqlTags(fullResponse: string): SqlQuery[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideExecuteSqlRegex = /<caide-execute-sql([^>]*)>([\s\S]*?)<\/caide-execute-sql>/g;
  const descriptionRegex = /description="([^"]+)"/;
  let match;
  const queries: { content: string; description?: string }[] = [];

  while ((match = caideExecuteSqlRegex.exec(normalized)) !== null) {
    const attributesString = match[1] || "";
    let content = unescapeXmlContent(match[2].trim());
    const descriptionMatch = descriptionRegex.exec(attributesString);
    const description = descriptionMatch?.[1] ? unescapeXmlAttr(descriptionMatch[1]) : undefined;

    // Handle markdown code blocks if present
    const contentLines = content.split("\n");
    if (contentLines[0]?.startsWith("```")) {
      contentLines.shift();
    }
    if (contentLines[contentLines.length - 1]?.startsWith("```")) {
      contentLines.pop();
    }
    content = contentLines.join("\n");

    queries.push({ content, description });
  }

  return queries;
}

export function getCaideCommandTags(fullResponse: string): string[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideCommandRegex = /<caide-command type="([^"]+)"[^>]*><\/caide-command>/g;
  let match;
  const commands: string[] = [];

  while ((match = caideCommandRegex.exec(normalized)) !== null) {
    commands.push(unescapeXmlAttr(match[1]));
  }

  return commands;
}

export function getCaideSearchReplaceTags(fullResponse: string): {
  path: string;
  content: string;
  description?: string;
}[] {
  const normalized = normalizeTagAliases(fullResponse);
  const caideSearchReplaceRegex =
    /<caide-search-replace([^>]*)>([\s\S]*?)<\/caide-search-replace>/gi;
  const pathRegex = /path="([^"]+)"/;
  const descriptionRegex = /description="([^"]+)"/;

  let match;
  const tags: { path: string; content: string; description?: string }[] = [];

  while ((match = caideSearchReplaceRegex.exec(normalized)) !== null) {
    const attributesString = match[1] || "";
    let content = unescapeXmlContent(match[2].trim());

    const pathMatch = pathRegex.exec(attributesString);
    const descriptionMatch = descriptionRegex.exec(attributesString);

    if (pathMatch && pathMatch[1]) {
      const path = unescapeXmlAttr(pathMatch[1]);
      const description = descriptionMatch?.[1] ? unescapeXmlAttr(descriptionMatch[1]) : undefined;

      // Handle markdown code fences if present
      const contentLines = content.split("\n");
      if (contentLines[0]?.startsWith("```")) {
        contentLines.shift();
      }
      if (contentLines[contentLines.length - 1]?.startsWith("```")) {
        contentLines.pop();
      }
      content = contentLines.join("\n");

      tags.push({ path: normalizePath(path), content, description });
    } else {
      logger.warn("Found <caide-search-replace> tag without a valid 'path' attribute:", match[0]);
    }
  }
  return tags;
}
