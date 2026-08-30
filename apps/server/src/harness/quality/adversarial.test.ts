import { describe, it, expect } from "vitest";
import { AdversarialRunner } from "./adversarial.ts";

describe("Milestone M21 — Adversarial Self-Play Testing", () => {
  it("generates comprehensive hostile test scenarios for a given screen", () => {
    const scenarios = AdversarialRunner.generateScenariosForScreen("PaymentScreen");
    expect(scenarios.length).toBeGreaterThanOrEqual(5);

    const categories = scenarios.map((s) => s.category);
    expect(categories).toContain("out_of_order");
    expect(categories).toContain("mid_flow_back");
    expect(categories).toContain("rapid_tab_switch");
    expect(categories).toContain("malformed_input");
    expect(categories).toContain("abrupt_abort");
  });

  it("detects vulnerabilities and creates actionable issue reports for Fixer", () => {
    const vulnerableCode = `
import React from 'react';

export function UnsafeView({ dirtyHtml, api }) {
  const submitData = () => {
    api.post('/endpoint'); // unhandled async network error
  };

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: dirtyHtml }} />
      <button onClick={submitData}>Send</button>
    </div>
  );
}
`;

    const result = AdversarialRunner.testScreenCode("UnsafeView", vulnerableCode);
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);

    const xssIssue = result.issues.find((i) => i.vulnerability.includes("dangerouslySetInnerHTML"));
    expect(xssIssue).toBeDefined();
    expect(xssIssue?.severity).toBe("critical");
    expect(xssIssue?.reproductionSteps.length).toBeGreaterThanOrEqual(2);
    expect(xssIssue?.suggestedFix).toContain("DOMPurify");
  });

  it("passes cleanly when screen code implements defensive validation and error handling", () => {
    const safeCode = `
import React, { useState } from 'react';

export function SafeView({ api }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    try {
      await api.post('/endpoint', { text });
    } catch (err) {
      setError('Failed to submit');
    }
  };

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button disabled={!text.trim()} onClick={handleSubmit}>Submit</button>
      {error && <p>{error}</p>}
    </div>
  );
}
`;

    const result = AdversarialRunner.testScreenCode("SafeView", safeCode);
    expect(result.passed).toBe(true);
    expect(result.issues.length).toBe(0);
  });
});
