import { describe, expect, it } from "vitest";
import {
  getCaideChatSummaryTag,
  getCaideCommandTags,
  getCaideCopyTags,
  getCaideDeleteTags,
  getCaideRenameTags,
  getCaideSearchReplaceTags,
  getCaideWriteTags,
  getCaideGenerateTestTags,
} from "./caide_tag_parser";

describe("getCaideGenerateTestTags", () => {
  it("parses a single generate-test tag", () => {
    const response = `Sure, here's a test:
<caide-generate-test path="tests/signup.spec.ts" description="Tests signup">
import { test, expect } from "@playwright/test";
test("signup", async ({ page }) => {
  await page.goto("/");
});
</caide-generate-test>`;
    const tags = getCaideGenerateTestTags(response);
    expect(tags).toHaveLength(1);
    expect(tags[0].path).toBe("tests/signup.spec.ts");
    expect(tags[0].description).toBe("Tests signup");
    expect(tags[0].content).toContain("@playwright/test");
  });

  it("strips markdown code fences", () => {
    const response = `<caide-generate-test path="tests/a.spec.ts">
\`\`\`ts
const x = 1;
\`\`\`
</caide-generate-test>`;
    const [tag] = getCaideGenerateTestTags(response);
    expect(tag.content).toBe("const x = 1;");
  });

  it("ignores tags without a path", () => {
    const response = `<caide-generate-test description="no path">x</caide-generate-test>`;
    expect(getCaideGenerateTestTags(response)).toHaveLength(0);
  });

  it("does not match plain caide-write tags", () => {
    const response = `<caide-write path="src/App.tsx">code</caide-write>`;
    expect(getCaideGenerateTestTags(response)).toHaveLength(0);
  });
});

describe("caide- tag aliases", () => {
  it("parses caide-write tags identically to caide-write", () => {
    const response = `<caide-write path="src/App.tsx">const x = 1;</caide-write>`;
    const tags = getCaideWriteTags(response);
    expect(tags).toHaveLength(1);
    expect(tags[0].path).toBe("src/App.tsx");
    expect(tags[0].content).toBe("const x = 1;");
  });

  it("parses caide-generate-test tags", () => {
    const response = `<caide-generate-test path="tests/a.spec.ts">const x = 1;</caide-generate-test>`;
    const [tag] = getCaideGenerateTestTags(response);
    expect(tag.path).toBe("tests/a.spec.ts");
    expect(tag.content).toBe("const x = 1;");
  });

  it("parses caide-rename tags", () => {
    const response = `<caide-rename from="src/A.tsx" to="src/B.tsx" />x</caide-rename>`;
    const [tag] = getCaideRenameTags(response);
    expect(tag.from).toBe("src/A.tsx");
    expect(tag.to).toBe("src/B.tsx");
  });

  it("parses caide-copy tags", () => {
    const response = `<caide-copy from="src/A.tsx" to="src/B.tsx" />`;
    const [tag] = getCaideCopyTags(response);
    expect(tag.from).toBe("src/A.tsx");
    expect(tag.to).toBe("src/B.tsx");
  });

  it("parses caide-delete tags", () => {
    const response = `<caide-delete path="src/A.tsx">x</caide-delete>`;
    expect(getCaideDeleteTags(response)).toEqual(["src/A.tsx"]);
  });

  it("parses caide-chat-summary tags", () => {
    const response = `<caide-chat-summary>Single-page app</caide-chat-summary>`;
    expect(getCaideChatSummaryTag(response)).toBe("Single-page app");
  });

  it("parses caide-command tags", () => {
    const response = `<caide-command type="Save to app"></caide-command>`;
    expect(getCaideCommandTags(response)).toEqual(["Save to app"]);
  });

  it("parses caide-search-replace tags", () => {
    const response = `<caide-search-replace path="src/App.tsx">x</caide-search-replace>`;
    const [tag] = getCaideSearchReplaceTags(response);
    expect(tag.path).toBe("src/App.tsx");
    expect(tag.content).toBe("x");
  });
});
