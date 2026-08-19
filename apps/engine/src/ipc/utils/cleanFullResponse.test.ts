import { cleanFullResponse } from "@/ipc/utils/cleanFullResponse";
import { describe, it, expect } from "vitest";

describe("cleanFullResponse", () => {
  it("should replace < characters in caide-write attributes", () => {
    const input = `<caide-write path="src/file.tsx" description="Testing <a> tags.">content</caide-write>`;
    const expected = `<caide-write path="src/file.tsx" description="Testing ＜a＞ tags.">content</caide-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should replace < characters in multiple attributes", () => {
    const input = `<caide-write path="src/<component>.tsx" description="Testing <div> tags.">content</caide-write>`;
    const expected = `<caide-write path="src/＜component＞.tsx" description="Testing ＜div＞ tags.">content</caide-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle multiple nested HTML tags in a single attribute", () => {
    const input = `<caide-write path="src/file.tsx" description="Testing <div> and <span> and <a> tags.">content</caide-write>`;
    const expected = `<caide-write path="src/file.tsx" description="Testing ＜div＞ and ＜span＞ and ＜a＞ tags.">content</caide-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle complex example with mixed content", () => {
    const input = `
      BEFORE TAG
  <caide-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use <a> tags.">
import React from 'react';
</caide-write>
AFTER TAG
    `;

    const expected = `
      BEFORE TAG
  <caide-write path="src/pages/locations/neighborhoods/louisville/Highlands.tsx" description="Updating Highlands neighborhood page to use ＜a＞ tags.">
import React from 'react';
</caide-write>
AFTER TAG
    `;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle other caide tag types", () => {
    const input = `<caide-rename from="src/<old>.tsx" to="src/<new>.tsx"></caide-rename>`;
    const expected = `<caide-rename from="src/＜old＞.tsx" to="src/＜new＞.tsx"></caide-rename>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle caide-delete tags", () => {
    const input = `<caide-delete path="src/<component>.tsx"></caide-delete>`;
    const expected = `<caide-delete path="src/＜component＞.tsx"></caide-delete>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should not affect content outside caide tags", () => {
    const input = `Some text with <regular> HTML tags. <caide-write path="test.tsx" description="With <nested> tags.">content</caide-write> More <html> here.`;
    const expected = `Some text with <regular> HTML tags. <caide-write path="test.tsx" description="With ＜nested＞ tags.">content</caide-write> More <html> here.`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle empty attributes", () => {
    const input = `<caide-write path="src/file.tsx">content</caide-write>`;
    const expected = `<caide-write path="src/file.tsx">content</caide-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });

  it("should handle attributes without < characters", () => {
    const input = `<caide-write path="src/file.tsx" description="Normal description">content</caide-write>`;
    const expected = `<caide-write path="src/file.tsx" description="Normal description">content</caide-write>`;

    const result = cleanFullResponse(input);
    expect(result).toBe(expected);
  });
});
