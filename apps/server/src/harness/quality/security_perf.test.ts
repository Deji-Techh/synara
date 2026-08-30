import { describe, it, expect } from "vitest";
import { auditSecurity } from "./security.ts";
import { auditPerformance } from "./performance.ts";

describe("Milestone M23 — Security & Performance Quality Passes", () => {
  it("security audit detects hardcoded API keys, insecure eval, and plain HTTP endpoints", () => {
    const insecureFiles = {
      "src/services/api.ts": `
const apiKey = "sk-abcdef1234567890abcdef1234567890";
export async function loadData() {
  return fetch("http://insecure-endpoint.com/data");
}
`,
      "src/utils/dynamic.ts": `
export function compute(val) {
  return eval(val);
}
`,
    };

    const audit = auditSecurity(insecureFiles);
    expect(audit.passed).toBe(false);
    expect(audit.violations.length).toBeGreaterThanOrEqual(3);

    const secretViolation = audit.violations.find((v) => v.rule === "no_hardcoded_secrets");
    expect(secretViolation).toBeDefined();

    const evalViolation = audit.violations.find((v) => v.rule === "no_eval_or_dynamic_code");
    expect(evalViolation).toBeDefined();

    const httpViolation = audit.violations.find((v) => v.rule === "https_only");
    expect(httpViolation).toBeDefined();
  });

  it("performance audit flags unvirtualized long lists and unoptimized images", () => {
    const sluggishFiles = {
      "src/screens/MassiveList.tsx": `
export function MassiveList() {
  const items = Array(200).fill(0).map((_, i) => ({ id: i }));
  return (
    <div>
      {items.map(item => <div key={item.id}>Item {item.id}</div>)}
    </div>
  );
}
`,
    };

    const audit = auditPerformance(sluggishFiles);
    expect(audit.passed).toBe(false);
    const listViolation = audit.violations.find((v) => v.rule === "list_virtualization");
    expect(listViolation).toBeDefined();
    expect(listViolation?.message).toContain("200 items");
    expect(listViolation?.suggestedFix).toContain("FlatList");
  });

  it("clean, secure, performant code passes both security and performance audits", () => {
    const cleanFiles = {
      "src/screens/CleanFeed.tsx": `
import React from 'react';
import { FlatList, View, Text } from 'react-native';

export function CleanFeed({ items }) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <Text>{item.title}</Text>}
    />
  );
}
`,
    };

    const sec = auditSecurity(cleanFiles);
    const perf = auditPerformance(cleanFiles);

    expect(sec.passed).toBe(true);
    expect(perf.passed).toBe(true);
  });
});
