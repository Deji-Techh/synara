export interface AdversarialScenario {
  id: string;
  name: string;
  category:
    | "malformed_input"
    | "out_of_order"
    | "mid_flow_back"
    | "rapid_tab_switch"
    | "parallel_ops"
    | "abrupt_abort";
  payload?: string;
  description: string;
}

export interface AdversarialIssueReport {
  screen: string;
  scenario: string;
  severity: "critical" | "high" | "medium" | "low";
  vulnerability: string;
  reproductionSteps: string[];
  suggestedFix: string;
}

export interface AdversarialTestResult {
  screen: string;
  passed: boolean;
  scenariosRun: number;
  scenarios: AdversarialScenario[];
  issues: AdversarialIssueReport[];
}

export const MALFORMED_PAYLOADS = [
  { name: "SQL Injection Probe", value: "'; DROP TABLE users; --" },
  { name: "Cross-Site Scripting (XSS)", value: "<script>alert('xss')</script>" },
  { name: "RTL Text String", value: "مرحبا بالعالم تجربة نصية" },
  { name: "Emoji Burst", value: "🔥🚀🌟💡🎉".repeat(20) },
  { name: "Max-Length Buffer Overflow", value: "A".repeat(5000) },
];

export class AdversarialRunner {
  static generateScenariosForScreen(screenName: string): AdversarialScenario[] {
    const scenarios: AdversarialScenario[] = [
      {
        id: "adv-out-of-order",
        name: "Out of Order Action Sequence",
        category: "out_of_order",
        description: `Trigger primary submit/confirmation action on ${screenName} before selecting or entering required parameters.`,
      },
      {
        id: "adv-mid-flow-back",
        name: "Abrupt Navigation Backout",
        category: "mid_flow_back",
        description: `Navigate back from ${screenName} during an in-flight operation and immediately re-enter.`,
      },
      {
        id: "adv-rapid-tab-switch",
        name: "Rapid Screen Switching",
        category: "rapid_tab_switch",
        description: `Mount and unmount ${screenName} 10 times in rapid succession while async effects are running.`,
      },
      {
        id: "adv-parallel-ops",
        name: "Concurrent Mutation Blast",
        category: "parallel_ops",
        description: `Fire multiple concurrent state mutations simultaneously on ${screenName}.`,
      },
      {
        id: "adv-abrupt-abort",
        name: "Simulated Network Abort",
        category: "abrupt_abort",
        description: `Trigger network error / rejection in the middle of ${screenName} data fetching or submission.`,
      },
    ];

    for (const p of MALFORMED_PAYLOADS) {
      scenarios.push({
        id: `adv-malformed-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name: `Malformed Input: ${p.name}`,
        category: "malformed_input",
        payload: p.value,
        description: `Inject payload '${p.name}' into all text input fields on ${screenName}.`,
      });
    }

    return scenarios;
  }

  static testScreenCode(screenName: string, code: string): AdversarialTestResult {
    const scenarios = this.generateScenariosForScreen(screenName);
    const issues: AdversarialIssueReport[] = [];

    // 1. Check for unescaped direct HTML injection
    if (code.includes("dangerouslySetInnerHTML") && !code.includes("sanitize")) {
      issues.push({
        screen: screenName,
        scenario: "Malformed Input: Cross-Site Scripting (XSS)",
        severity: "critical",
        vulnerability: "Unsanitized dangerouslySetInnerHTML allows arbitrary script execution.",
        reproductionSteps: [
          `1. Open screen ${screenName}`,
          "2. Inject malicious HTML/JS string into input or data field",
          "3. View rendered output",
        ],
        suggestedFix: "Use DOMPurify or avoid dangerouslySetInnerHTML entirely.",
      });
    }

    // 2. Check for missing validation before submit
    if (code.includes("onSubmit") || code.includes("onPress")) {
      const hasValidation =
        code.includes("validate") ||
        code.includes(".trim()") ||
        code.includes("if (!") ||
        code.includes("disabled={!") ||
        code.includes("disabled={");
      if (!hasValidation) {
        issues.push({
          screen: screenName,
          scenario: "Out of Order Action Sequence",
          severity: "high",
          vulnerability:
            "Action triggers without input/state validation, allowing empty or malformed requests.",
          reproductionSteps: [
            `1. Open screen ${screenName}`,
            "2. Click submit button immediately without filling inputs",
          ],
          suggestedFix: "Add input validation and disable action button until form is valid.",
        });
      }
    }

    // 3. Check for unhandled async error states
    if (code.includes("fetch(") || code.includes("api.") || code.includes("axios.")) {
      const hasCatch =
        code.includes("catch") || code.includes("onError") || code.includes("isError");
      if (!hasCatch) {
        issues.push({
          screen: screenName,
          scenario: "Simulated Network Abort",
          severity: "high",
          vulnerability: "Unhandled promise rejection when network call fails or aborts.",
          reproductionSteps: [
            `1. Open screen ${screenName}`,
            "2. Trigger async action while network is offline or aborted",
          ],
          suggestedFix:
            "Wrap async network calls in try/catch or use React Query onError/error boundary.",
        });
      }
    }

    return {
      screen: screenName,
      passed: issues.length === 0,
      scenariosRun: scenarios.length,
      scenarios,
      issues,
    };
  }
}
